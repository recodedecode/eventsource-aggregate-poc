import { Inject, Injectable, Scope } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { CassandraService } from '@recodedecode/nest-cassandra'
import { ID } from '@recodedecode/types'
import { dateTimeISO } from '@recodedecode/utils'
import { AggregateRoot, IAggrgateClass } from '../aggregate'
import { IEventState, IStore } from '../types'
import { actualizeEvent } from '../utils'


@Injectable({ scope: Scope.TRANSIENT })
export class Store<T extends AggregateRoot> implements IStore<T> {

  constructor (
    @Inject('Aggregate') private readonly aggregate: IAggrgateClass<T>,
    @Inject('StreamName') private readonly streamName: string,
    private readonly cassandraService: CassandraService,
    private readonly eventBus: EventBus,
  ) { }

  public async create (aggregateId?: ID): Promise<T> {
    const aggregate = new this.aggregate(aggregateId)
    return aggregate
  }

  public async load (aggregateId: ID): Promise<T> {

    const query = `select * from ${this.streamName} `
      + `where aggregate_id='${aggregateId}' `
      + `limit 1`

    const response = await this.cassandraService.execute(query)
    const lastSnapshot = response.rows[0] as unknown as IEventState
    const snapshotEvent = actualizeEvent(lastSnapshot.event_type, lastSnapshot.event_data)
  
    const aggregate = new this.aggregate(aggregateId)
    aggregate.loadFromHistory([snapshotEvent])
    return aggregate as T
  }

  public async commit (aggregate: T): Promise<void> {

    const snapshotEvent = aggregate.snapshot()

    if ( ! snapshotEvent) {
      // TODO throw error
      return
    }
  
    const node: IEventState = {
      stream: this.streamName,
      aggregate_id: aggregate.id,
      updated_at: dateTimeISO(),
      event_type: snapshotEvent.constructor.name,
      event_data: JSON.stringify(snapshotEvent),
    }
  
    const query = `insert into ${this.streamName} json '${JSON.stringify(node)}'`
    await this.cassandraService.execute(query)
  
    const eventsToDispatch = aggregate.getUncommittedEvents()

    for (const eventToDispatch of eventsToDispatch) {
      await this.eventBus.publish(eventToDispatch)
    }
  }

}
