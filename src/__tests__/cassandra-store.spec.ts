import { expect } from '@hapi/code'
import { CqrsModule, EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { CassandraService } from '@recodedecode/nest-cassandra'
import { AggregateRoot } from '../aggregate'
import { Store } from '../services'
import { IEvent } from '../types'
import * as stubs from './aggregate-store-stubs'


describe('Aggregate Store', () => {

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
  let store: Store<TestAggregate>
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
        Store,
      ],
    }).compile()

    cassandraService = await moduleRef.resolve<CassandraService>(CassandraService)
    store = await moduleRef.resolve<Store<TestAggregate>>(Store)
  })

  it('should create a new aggregate', async () => {
    const aggregate = await store.create()
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

  it('should load an aggregate', async () => {

    jest.spyOn(cassandraService, 'execute').mockImplementation(async () => ({
      rows: stubs.snapshotEvents,
    }) as any)
  
    const aggregate = await store.load(aggregateId)

    expect(aggregate.getLoadedEvents()).to.be.an.array()
    expect(aggregate.getLoadedEvents().length).to.equal(1)
  })

  it('should commit an event', async () => {

    let query: any

    jest.spyOn(cassandraService, 'execute').mockImplementation(async (value) => {
      query = value
      return {} as any
    })

    const aggregate = await store.create(aggregateId)
    aggregate.addName('CassandraDB')
    aggregate.addDescription('Cassandra is a wide-column store')
    await store.commit(aggregate)

    expect(query).to.be.a.string()
    expect(query).to.be.a.string()
    expect(query).to.contain(`"aggregate_id":"${aggregateId}"`)
    expect(query).to.contain(`"stream":"${streamName}"`)
    expect(query).to.contain('"updated_at"')
    expect(query).to.contain('"event_type":"SnapshotEvent"')
    expect(query).to.contain('"event_data"')

    expect(publishedEvents).to.be.an.array()
    expect(publishedEvents.length).to.equal(2)

    expect(publishedEvents[0].constructor.name).to.equal(AddedNameEvent.name)
    expect(publishedEvents[1].constructor.name).to.equal(AddedDescriptionEvent.name)
  })

})
