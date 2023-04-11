import { expect } from '@hapi/code'
import { CqrsModule, EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { RedisService } from '@liaoliaots/nestjs-redis'
import { CassandraService } from '@recodedecode/nest-cassandra'
import { AggregateRoot } from '../aggregate'
import { Repository } from '../services'
import { IEvent } from '../types'
import * as stubs from './aggregate-repository-stubs'


describe('Aggregate Repository', () => {

  interface IAggregateState {
    id: string
    name: string
    description: string
  }
  
  class AddedNameEvent {
    constructor (
      public readonly name: string,
    ) { }
  }
  
  class AddedDescriptionEvent {
    constructor (
      public readonly name: string,
    ) { }
  }
  
  class SnapshotEvent {
    constructor (
      public readonly state: any,
    ) { }
  }

  class TestAggregate extends AggregateRoot<IAggregateState> {
  
    protected state: IAggregateState = {
      id: this.id,
      name: '',
      description: '',
    }

    addName (name: string) {
      this.apply(new AddedNameEvent(name))
    }

    onAddedNameEvent (event: any) {
      this.state.name = event.name
    }

    addDescription (description: string) {
      this.apply(new AddedDescriptionEvent(description))
    }

    onAddedDescriptionEvent (event: any) {
      this.state.description = event.description
    }

    snapshot () {
      return new SnapshotEvent(this.state)
    }

    onSnapshotEvent (event: any) {
      this.state = event.state
    }
  
  }

  let aggregateId: string
  let cassandraService: CassandraService
  let publishedEvents: IEvent[]
  let repository: Repository<TestAggregate>
  let streamName: string

  beforeEach(async () => {

    aggregateId = '1234567890'
    streamName = 'mix'
    publishedEvents = []
  
    const createMockCassandraService = () => ({
      getClient () {
        return {
          batch: async (queries: any, options: any) => {}, // eslint-disable-line
          execute: async (query: any) => {}, // eslint-disable-line
        }
      },
      batch () {}, // eslint-disable-line
      execute () {}, // eslint-disable-line
    })
  
    const createMockRedisService = () => ({
      getClient () {
        return {
          set: async (key: string, value: any, op: string, ttl: number) => {}, // eslint-disable-line
          get: async (key: string) => {}, // eslint-disable-line
          del: async (key: string) => {}, // eslint-disable-line
        }
      }
    })

    const createMockEventBusService = () => ({
      publish: async (event) => {
        publishedEvents.push(event)
      },
    })

    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule,
      ],
      providers: [
        { provide: 'Aggregate', useValue: TestAggregate },
        { provide: 'StreamName', useValue: streamName },
        { provide: CassandraService, useValue: createMockCassandraService() },
        { provide: EventBus, useValue: createMockEventBusService() },
        { provide: RedisService, useValue: createMockRedisService() },
        Repository,
      ],
    }).compile()

    cassandraService = await moduleRef.resolve<CassandraService>(CassandraService)
    repository = await moduleRef.resolve<Repository<TestAggregate>>(Repository)
  })

  it('should create a new aggregate', async () => {
    const aggregate = await repository.create()
    expect(aggregate).to.be.object()
    expect(aggregate.id).to.be.a.string()
    expect(aggregate.apply).to.be.a.function()
    expect(aggregate.commit).to.be.a.function()
    expect(aggregate.getLoadedEvents).to.be.a.function()
    expect(aggregate.getLoadedEventNodes).to.be.a.function()
    expect(aggregate.getState).to.be.a.function()
    expect(aggregate.getUncommittedEvents).to.be.a.function()
    expect(aggregate.loadFromHistory).to.be.a.function()
    expect(aggregate.loadFromEventNodes).to.be.a.function()
    expect(aggregate.snapshot).to.be.a.function()
    expect(aggregate.uncommit).to.be.a.function()
    expect(aggregate.addName).to.be.a.function()
  })

  it('should load an aggregate with all events', async () => {

    jest.spyOn(cassandraService, 'execute').mockImplementation(async () => ({
      rows: stubs.basicEvents,
    }) as any)
  
    const aggregate = await repository.load(aggregateId)

    expect(aggregate.getLoadedEventNodes()).to.be.an.array()
    expect(aggregate.getLoadedEventNodes().length).to.equal(2)

    expect(aggregate.getLoadedEvents()).to.be.an.array()
    expect(aggregate.getLoadedEvents().length).to.equal(2)
  })

  it('should load an aggregate from a snapshot', async () => {

    jest.spyOn(cassandraService, 'execute').mockImplementation(async (query) =>{
      if (query.includes('_snapshot')) {
        return {
          rows: stubs.snapshotEvents,
        } as any
      }
      return {
        rows: [],
      } as any
    })

    const aggregate = await repository.loadFromSnapshot(aggregateId)
    expect(aggregate.getLoadedEvents()).to.be.an.array()
    expect(aggregate.getLoadedEvents().length).to.equal(1)
    expect(aggregate.getState().name).to.equal('Cassandra')
    expect(aggregate.getState().description).to.equal('Cassandra is a free and open-source, distributed, wide-column store.')
  })

  it('should load an aggregare from a snapshot and event history', async () => {

    jest.spyOn(cassandraService, 'execute').mockImplementation(async (query) => {
      if (query.includes('_snapshot')) {
        return {
          rows: stubs.snapshotEvents,
        } as any
      }
      return {
        rows: stubs.postSnapshotEvents,
      } as any
    })

    const aggregate = await repository.loadFromSnapshot(aggregateId)
    expect(aggregate.getLoadedEvents()).to.be.an.array()
    expect(aggregate.getLoadedEvents().length).to.equal(3)
    expect(aggregate.getState().name).to.equal('Cassandra')
    expect(aggregate.getState().description).to.equal('Cassandra is a NoSQL type DB.')
  })

  it('should commit an event', async () => {

    let queries: any
    jest.spyOn(cassandraService, 'batch').mockImplementation(async (value) => {
      queries = value
      return {} as any
    })

    const aggregate = await repository.create(aggregateId)
    aggregate.addName('CassandraDB')
    await repository.commit(aggregate)

    expect(queries).to.be.an.array()
    expect(queries.length).to.equal(1)
    expect(queries[0].query).to.be.a.string()
    expect(queries[0].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[0].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[0].query).to.contain('"commit_id"')
    expect(queries[0].query).to.contain('"commit_index":1')
    expect(queries[0].query).to.contain('"commit_link":null')
    expect(queries[0].query).to.contain('"created_at"')
    expect(queries[0].query).to.contain('"event_type":"AddedNameEvent"')
    expect(queries[0].query).to.contain('"event_data"')

    expect(publishedEvents).to.be.an.array()
    expect(publishedEvents.length).to.equal(1)
    expect(publishedEvents[0].constructor.name).to.equal(AddedNameEvent.name)
  })

  it('should commit multiple events', async () => {

    let queries: any
    jest.spyOn(cassandraService, 'batch').mockImplementation(async (value) => {
      queries = value
      return {} as any
    })

    const aggregate = await repository.create(aggregateId)
    aggregate.addName('CassandraDB')
    aggregate.addName('Cassandra DB')
    aggregate.addDescription('Cassandra is a wide-column store')
    await repository.commit(aggregate)

    expect(queries.length).to.equal(3)
  
    expect(queries[0].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[0].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[0].query).to.contain('"commit_index":1')
    expect(queries[0].query).to.contain('"commit_link":null')
    expect(queries[0].query).to.contain('"event_type":"AddedNameEvent"')

    expect(queries[1].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[1].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[1].query).to.contain('"commit_index":2')
    expect(queries[1].query).to.contain('"event_type":"AddedNameEvent"')

    expect(queries[2].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[2].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[2].query).to.contain('"commit_index":3')
    expect(queries[2].query).to.contain('"event_type":"AddedDescriptionEvent"')

    expect(publishedEvents).to.be.an.array()
    expect(publishedEvents.length).to.equal(3)
    expect(publishedEvents[0].constructor.name).to.equal(AddedNameEvent.name)
    expect(publishedEvents[1].constructor.name).to.equal(AddedNameEvent.name)
    expect(publishedEvents[2].constructor.name).to.equal(AddedDescriptionEvent.name)
  
  })

  it('should commit an event and create a snapshot', async () => {

    let queries: any

    jest.spyOn(cassandraService, 'batch').mockImplementation(async (value) => {
      queries = value
      return {} as any
    })

    jest.spyOn(cassandraService, 'execute').mockImplementation(async (query) => {
      if (query.includes('_snapshot')) {
        return {
          rows: [],
        } as any
      }
      return {
        rows: stubs.historyEvents,
      } as any
    })
  
    const aggregate = await repository.loadFromSnapshot(aggregateId)
    aggregate.addName('Cassandra #10')
    await repository.commit(aggregate)

    expect(queries.length).to.equal(2)

    expect(queries[0].query).to.be.a.string()
    expect(queries[0].query).to.contain('insert into domain_mix_stream')
    expect(queries[0].query).to.contain('"commit_index":10')

    expect(queries[1].query).to.be.a.string()
    expect(queries[1].query).to.contain('insert into domain_mix_snapshot')
    expect(queries[1].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[1].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[1].query).to.contain('"commit_id"')
    expect(queries[1].query).to.contain('"commit_index":10')
    expect(queries[1].query).to.contain('"commit_link"')
    expect(queries[1].query).to.contain('"created_at"')
    expect(queries[1].query).to.contain('"event_type":"SnapshotEvent"')
    expect(queries[1].query).to.contain('"event_data"')
  })

  it('should commit multiple events and create a snapshot', async () => {

    let queries: any

    jest.spyOn(cassandraService, 'batch').mockImplementation(async (value) => {
      queries = value
      return {} as any
    })

    jest.spyOn(cassandraService, 'execute').mockImplementation(async (query) => {
      if (query.includes('_snapshot')) {
        return {
          rows: [],
        } as any
      }
      return {
        rows: stubs.historyEvents,
      } as any
    })
  
    const aggregate = await repository.loadFromSnapshot(aggregateId)
    aggregate.addName('Cassandra #10')
    aggregate.addName('Cassandra #11')
    aggregate.addName('Cassandra #12')
    await repository.commit(aggregate)

    expect(queries.length).to.equal(4)

    expect(queries[0].query).to.be.a.string()
    expect(queries[0].query).to.contain('insert into domain_mix_stream')
    expect(queries[0].query).to.contain('"commit_index":10')

    expect(queries[1].query).to.be.a.string()
    expect(queries[1].query).to.contain('insert into domain_mix_stream')
    expect(queries[1].query).to.contain('"commit_index":11')

    expect(queries[2].query).to.be.a.string()
    expect(queries[2].query).to.contain('insert into domain_mix_stream')
    expect(queries[2].query).to.contain('"commit_index":12')

    expect(queries[3].query).to.be.a.string()
    expect(queries[3].query).to.contain('insert into domain_mix_snapshot')
    expect(queries[3].query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(queries[3].query).to.contain(`"stream":"${streamName}"`)
    expect(queries[3].query).to.contain('"commit_index":10')
    expect(queries[3].query).to.contain('"event_type":"SnapshotEvent"')
  
  })

})
