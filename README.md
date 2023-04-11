> ***IMPORTANT:** This repo showcases a single library from a wider personal project built within [NX](https://nx.dev/). As such it does not contain the supporting structure as it was extracted as is for the purposes of showcasing some ideas.*
>
> *It builds off of the great work done by the [Nestjs](https://nestjs.com/) creators with their [CQRS](https://github.com/nestjs/cqrs) package. It furthers those with several adjustments so that the aggregate supports event source streams (well at least the way I was doing them). One of the main things I wanted at this time was to create tests for the aggregate events in a more readable fashion - hence the test toolkit here.*
>
> *It all still needs work but twas fun and maybe this will help someone else.*

# Event Source Aggregate POC

A Nestjs based library for building out Event Sourced Aggregates.




## Test Toolkit

As a super quick overview the test toolkit enables you to chain assertions together like other popular testing libraries. It passes the aggregate through to `when` methods where you can perform operations on it and then check the appopriate events have been applied. There's more to it but this highlights the basic idea.

```javascript
import { check } from '@recodedecode/nest-eventsource'

describe('_Files Aggregate', () => {

  let aggregateId

  beforeEach(() => {
    aggregateId = 'x1'
    title = 'enamel pin pabst copper mug'
    author = 'maximus'
    publishDateTime = '22/12/12'
  })

  it('should create new file aggregate', () => {

    check(new MyAggregate(aggregateId))
      .when(aggregate.create(title, author))
      .when(aggregate.schedule(publishDateTime))
      .has.one.event(CreatedMyAggregateEvent)
      .that.includes({ title, author, publishDateTime })
      .and.when(aggregate.publish())
      .has.one.event(PublishedMyAggregateEvent)
  })
})
```
