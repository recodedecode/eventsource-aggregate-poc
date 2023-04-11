import { expect } from '@hapi/code'
import { AggregateRoot } from '../aggregate'
import { IEvent } from '../types'


describe('Aggregate', () => {

  describe('Aggregate Root', () => {

    class Created implements IEvent {}
    class Updated implements IEvent {}
    class Closed implements IEvent {}

    let aggregate: AggregateRoot
    let events: IEvent[]

    beforeEach(async () => {

      aggregate = new AggregateRoot()

      events = [
        new Created(),
        new Updated(),
        new Closed(),
      ]
    })

    it('should have interface functions', async () => {

      expect(aggregate.getState).to.be.a.function()
      expect(aggregate.commit).to.be.a.function()
      expect(aggregate.uncommit).to.be.a.function()
      expect(aggregate.getUncommittedEvents).to.be.a.function()
      expect(aggregate.loadFromHistory).to.be.a.function()
      expect(aggregate.getLoadedEvents).to.be.a.function()
      expect(aggregate.apply).to.be.a.function()
    })

    it('should load events from history', async () => {

      expect(aggregate.loadFromHistory).to.be.a.function()
      aggregate.loadFromHistory(events)

      const loadedEvents = aggregate.getLoadedEvents()
      expect(loadedEvents).to.be.an.array()
      expect(loadedEvents.length).to.equal(3)
    })

    it('should apply event', async () => {

      aggregate.apply(new Created())

      const uncommittedEvents = aggregate.getUncommittedEvents()
      expect(uncommittedEvents).to.be.an.array()
      expect(uncommittedEvents.length).to.equal(1)
    })

    it('should commit events', async () => {

      aggregate.apply(new Created())
      aggregate.commit()

      const uncommittedEvents = aggregate.getUncommittedEvents()
      expect(uncommittedEvents).to.be.an.array()
      expect(uncommittedEvents.length).to.equal(0)
    })

    it('should uncommit events', async () => {

      aggregate.apply(new Created())
      aggregate.uncommit()

      const uncommittedEvents = aggregate.getUncommittedEvents()
      expect(uncommittedEvents).to.be.an.array()
      expect(uncommittedEvents.length).to.equal(0)
    })
    

  })

  describe('Aggregate Class', () => {

    class Created implements IEvent {

      constructor (
        public readonly id: string,
        public readonly createdAt: string,
      ) { }
  
    }

    class TestAggregate extends AggregateRoot<any> {

      protected state: any = {}

      create () {
        this.apply(new Created('id-01', '2022-04-11'))
      }

      onCreated (event: Created) {
        //
        this.state.id = event.id
        this.state.createdAt = event.createdAt
      }

    }

    let aggregate: TestAggregate

    beforeEach(async () => {
      aggregate = new TestAggregate()
    })

    it('should apply event', async () => {

      aggregate.create()
      const uncommittedEvents = aggregate.getUncommittedEvents()
      expect(uncommittedEvents).to.be.an.array()
      expect(uncommittedEvents.length).to.equal(1)
    })

    it('should apply internal state', async () => {

      aggregate.create()
      const state = aggregate.getState()

      expect(state).to.be.an.object()
      expect(state.id).to.equal('id-01')
      expect(state.createdAt).to.equal('2022-04-11')
    })
  
  })

})
