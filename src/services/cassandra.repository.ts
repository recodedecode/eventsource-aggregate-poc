import { Inject, Injectable, Scope } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { RedisService } from '@liaoliaots/nestjs-redis'
import { CassandraService } from '@recodedecode/nest-cassandra'
import { NotFoundError, UnprocessableError } from '@recodedecode/nest-domain'
import { nextFlakeId } from '@recodedecode/nest-method'
import { ID } from '@recodedecode/types'
import { dateTimeISO } from '@recodedecode/utils'
import { AggregateRoot, IAggrgateClass } from '../aggregate'
import { IEventCommit, IEvent, IEventNode, IRepository, LoadOptions } from '../types'
import { actualizeEvent, delay } from '../utils'


@Injectable({ scope: Scope.TRANSIENT })
export class Repository<T extends AggregateRoot> implements IRepository<T> {

  private readonly snapshotDistribution = 10

  constructor (
    @Inject('Aggregate') private readonly aggregate: IAggrgateClass<T>,
    @Inject('StreamName') private readonly streamName: string,
    private readonly cassandraService: CassandraService,
    private readonly eventBus: EventBus,
    private readonly redisService: RedisService,
  ) { }

  async create (aggregateId?: ID): Promise<T> {
    const aggregate = new this.aggregate(aggregateId)
    return aggregate
  }

  async load (aggregateId: ID, options?: LoadOptions): Promise<T> {

    if (await this.isLocked(aggregateId)) {
      throw new UnprocessableError()
    }

    if ( ! options?.unlocked) {
      await this.lockAggregate(aggregateId)
    }

    const eventsQuery = `select * from domain_${this.streamName}_stream `
      + `where aggregate_id='${aggregateId}' `

    const eventsResponse = await this.cassandraService.execute(eventsQuery)
    const nodes = eventsResponse.rows as unknown as IEventCommit[]

    const eventHistory: IEventNode[] = nodes
      .sort((a, b) => a.commit_id > b.commit_id ? 1 : -1)
      .map((node: IEventCommit) => ({
        event: actualizeEvent(node.event_type, node.event_data),
        metadata: {
          id: node.commit_id,
          index: node.commit_index || 0,
        },
      }))

    return this.loadAggregate(aggregateId, eventHistory)
  }

  async loadFromSnapshot (aggregateId: ID, options?: LoadOptions, attempt = 0): Promise<T> {
    /*
     * 1. Get the snapshot event
     * 2. Get all events after snapshot
     * 3. Combine events in order
     * 4. Load the events into the aggregate
     * 5. Return the aggregate
     */
    if (await this.isLocked(aggregateId)) {
      if (attempt <= 1) {
        const nextAttempt = attempt + 1
        await delay(nextAttempt * 200)
        return this.loadFromSnapshot(aggregateId, options, nextAttempt)
      }
      throw new UnprocessableError()
    }

    if ( ! options?.unlocked) {
      await this.lockAggregate(aggregateId)
    }

    const snapshotQuery = `select * from domain_${this.streamName}_snapshot limit 1`
    const snapshotResponse = await this.cassandraService.execute(snapshotQuery)
    const lastSnapshot = snapshotResponse.rows[0] as unknown as IEventCommit

    if ( ! lastSnapshot) {

      if ( ! options?.unlocked) {
        await this.unlockAggregate(aggregateId)
      }
  
      return this.load(aggregateId)
    }

    const eventsQuery = `select * from domain_${this.streamName}_stream `
      + `where aggregate_id='${aggregateId}' `
      + `and commit_id > '${lastSnapshot.commit_id}' `
      + `limit 10;`

    const eventsResponse = await this.cassandraService.execute(eventsQuery)
    const nodes = eventsResponse.rows as unknown as IEventCommit[]

    if ( ! nodes.length && ! lastSnapshot) {
      throw new NotFoundError()
    }

    const eventHistory: IEventNode[] = nodes
      .sort((a, b) => a.commit_id > b.commit_id ? 1 : -1)
      .map((node: IEventCommit) => ({
        event: actualizeEvent(node.event_type, node.event_data),
        metadata: {
          id: node.commit_id,
          index: node.commit_index || 0,
        }
      }))
  
    eventHistory.unshift({
      event: actualizeEvent(lastSnapshot.event_type, lastSnapshot.event_data),
      metadata: {
        id: lastSnapshot.commit_id,
        index: lastSnapshot.commit_index || 0,
      }
    })

    return this.loadAggregate(aggregateId, eventHistory)
  }

  async commit (aggregate: T): Promise<void> {
    /*
     * 1. Check if the aggregate has a 'snapshot' method.
     * 2. Call the snapshot method and get the returned event.
     * 3. Store the aggregate events on the main stream.
     * 4. Store the snapshot on a snapshot stream.
     */

    // Get commit offsets
    const committedEvents = aggregate.getLoadedEventNodes()
    const lastEvent = committedEvents[committedEvents.length - 1]
    const initialIndex = lastEvent ? lastEvent.metadata.index : 0
    const initialLink = lastEvent ? lastEvent.metadata.id : null

    // Get and process events to commit
    const eventsToDispatch = aggregate.getUncommittedEvents()

    const eventsToCommit: IEventCommit[] = []
  
    for (let i = 0; i < eventsToDispatch.length; i ++) {
      const event = eventsToDispatch[i]
      const index = initialIndex + 1 + i
      const link = i === 0 ? initialLink : eventsToCommit[i - 1].commit_id
      const node = this.createEventStreamNode(aggregate.id, event, index, link)
      eventsToCommit.push(node)
    }

    if ( ! eventsToCommit.length) {
      await this.unlockAggregate(aggregate.id)
      return
    }

    const queries = eventsToCommit
      .map(event => `insert into domain_${this.streamName}_stream json '${JSON.stringify(event)}'`)
      .map(query => ({ query }))

    // Determine snapshots
    // 1. load the aggregate with events up to a snapshot point
    // 2. create the snapshot.
    // 3. Add the snapshot to the list of commits to persist
    // 4. Repeat for any remaining snapshots

    const rebuildAggregate = new this.aggregate(aggregate.id)
    rebuildAggregate.loadFromEventNodes(committedEvents)

    eventsToDispatch
      .map((eventToDispatch, index) => {
        const eventToCommit = eventsToCommit[index]
        rebuildAggregate.apply(eventToDispatch)
        if (eventToCommit.commit_index % this.snapshotDistribution === 0) {
          const snapshotEvent = rebuildAggregate.snapshot()
          if (snapshotEvent) {
            const snapshotNode = this.createEventStreamNode(
              aggregate.id,
              snapshotEvent,
              eventToCommit.commit_index,
              eventToCommit.commit_link,
            )
            snapshotNode.commit_id = eventToCommit.commit_id
            return snapshotNode
          }
        }
      })
      .filter(x => x)
      .forEach(snapshotEvent => {
        const query = `insert into domain_${this.streamName}_snapshot `
          + `json '${JSON.stringify(snapshotEvent)}'`

        queries.push({ query })
      })

    // Append commits
    await this.cassandraService.batch(queries, { prepare: true })

    await this.unlockAggregate(aggregate.id)

    // displatch events locally
    for (const eventToDispatch of eventsToDispatch) {
      await this.eventBus.publish(eventToDispatch)
    }

    return
  }

  async run (aggregate: T, cb: CallableFunction) {
    try {
      cb()
    }
    catch (error) {
      await this.unlockAggregate(aggregate.id)
      throw error
    }
  }

  protected loadAggregate (aggregateId: ID, eventHistory: IEventNode<IEvent>[]): T {
    const aggregate = new this.aggregate(aggregateId)

    aggregate.setFailureHandler((error) => {
      this.unlockAggregate(aggregate.id)
      throw error
    })
  
    aggregate.loadFromEventNodes(eventHistory)
    return aggregate as T
  }

  protected async lockAggregate (aggregateId: ID, ttl = 5) {
    const lockId = `${this.streamName}:${aggregateId}`
    const redis = this.redisService.getClient()
    await redis.set(lockId, lockId, 'EX', ttl)
  }

  protected async unlockAggregate (aggregateId: ID) {
    const lockId = `${this.streamName}:${aggregateId}`
    const redis = this.redisService.getClient()
    await redis.del(lockId)
  }

  protected async isLocked (aggregateId: ID): Promise<boolean> {
    const lockId = `${this.streamName}:${aggregateId}`
    const redis = this.redisService.getClient()
    const locked = await redis.get(lockId)
    return locked ? true : false
  }

  protected createEventStreamNode <T extends IEvent = IEvent>(
    aggregateId: ID,
    event: T,
    index: number,
    link: ID,
  ): IEventCommit {
    return {
      stream: this.streamName,
      aggregate_id: aggregateId,
      commit_id: nextFlakeId(),
      commit_index: index,
      commit_link: link,
      created_at: dateTimeISO(),
      event_type: event.constructor.name,
      event_data: JSON.stringify(event),
    }
  }

}
