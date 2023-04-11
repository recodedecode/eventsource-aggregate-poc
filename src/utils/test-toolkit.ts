import colors from 'colors'
import { expect } from '@hapi/code'
import { AggregateRoot } from '../aggregate'
import { IEvent } from '../types'


const getEventClassName = (event: any): string => {
  return event.name as string
}

const getEventProtoName = (event: IEvent): string => {
  const { constructor } = Object.getPrototypeOf(event)
  return constructor.name as string
}

const occurances = (list: string[], key: string) => {
  return list.reduce((acc, curr) => {
    return acc += curr === key ? 1 : 0
  }, 0)
}

const throwError = (
  message: string,
  actual = '',
  expected = ''
) => {
  const msg = colors.red(message)
  const ex = expected ? colors.green(`Expected: ${expected}`) : ''
  const ac = expected ? colors.red(`Received: ${actual}`) : ''
  const errorMessage = `${msg}\n\n  ${ex}\n  ${ac}\n`
  const error = new Error(errorMessage) as any
  error.actual = actual
  error.expected = expected
  error.stack = Error.captureStackTrace(error)
  throw error
}

type WhenCallback = (aggregate: AggregateRoot) => void

type AfterCallback = (aggregate: AggregateRoot) => Promise<void> | void

export const check = <T extends AggregateRoot>(
  aggregate: T
) => {

  const flags: string[] = []
  let events: IEvent[] = []
  let occuranceExpectation = -1
  let withMessage: string

  const addEvents = (event: IEvent | IEvent[]) => {
    events = Array.isArray(event)
      ? event
      : [event]
  }

  const assertEvent = () => {

    const uncommittedEvents = aggregate.getUncommittedEvents()
    const uncommittedEventNames = uncommittedEvents.map(event => getEventProtoName(event))

    if (flags.includes('debug')) {

      const aggregateStream = uncommittedEvents.map((uncommittedEvents, index) => {
        return `- [${index}] ${getEventProtoName(uncommittedEvents)} ${JSON.stringify(uncommittedEvents, null, 2)}`
      }).join('\n')

      const eventStream = events.map((event, index) => {
        return `- [${index}] ${getEventClassName(event)}`
      }).join('\n')

      const output = colors.green(`\nDEBUG:`)
        + colors.cyan(`\n\nAggregate events:`)
        + colors.cyan(`\n\n${aggregateStream}`)
        + colors.yellow(`\n\nTarget events:`)
        + colors.yellow(`\n\n${eventStream}`)
      console.log(output)
    }

    if ( ! uncommittedEvents.length) {
      throwError(
        `There are no events in the aggregate event stream to evaluate.`,
        `${uncommittedEvents.length}`,
        '1 or more'
      )
    }

    if (flags.includes('excludes')) {

      events.forEach(event => {
        const eventName = getEventClassName(event)
        const occuredCount = occurances(uncommittedEventNames, eventName)

        if (occuredCount) {
          throwError(
            `Event '${eventName}' was found in the aggregate event stream.`,
            `${occuredCount}`,
            `0`
          )
        }
      })
      return
    }

    if (flags.includes('exactly')) {

      events.forEach(event => {
        const eventName = getEventClassName(event)
        const eventCount = occurances(uncommittedEventNames, eventName)

        if (eventCount !== occuranceExpectation) {
          throwError(
            `Event '${eventName}' did not match exact event count in the aggregate stream.`,
            `${eventCount}`,
            `${occuranceExpectation}`
          )
        }
      })
    }

    if (flags.includes('one')) {

      events.forEach(event => {
        const eventName = getEventClassName(event)
        const eventCount = occurances(uncommittedEventNames, eventName)

        if (eventCount < 1) {
          throwError(
            `Event '${eventName}' was not found in the aggregate event stream.`,
            `${eventCount}`,
            `1`
          )
        }
        if (eventCount > 1) {
          throwError(
            `Event '${eventName}' occurs more than once in the aggregate event stream.`,
            `${eventCount}`,
            `1`
          )
        }
      })
    }

    if (flags.includes('first')) {
  
      const firstUncommittedEventName = getEventProtoName(uncommittedEvents[0])
  
      events.forEach(event => {
        const eventName = getEventClassName(event)

        if (firstUncommittedEventName !== eventName) {
          throwError(
            `Event '${eventName}' is not the first event in the aggregate event stream.`,
            `${eventName}`,
            `${firstUncommittedEventName}`
          )
        }
      })
    }

    if (flags.includes('last')) {
      
      const uncommittedEventCount = uncommittedEvents.length - 1
      const lastUncommittedEventName = getEventProtoName(uncommittedEvents[uncommittedEventCount])

      events.forEach(event => {
        const eventName = getEventClassName(event)

        if (lastUncommittedEventName !== eventName) {
          throwError(
            `Event '${eventName}' is not the last event in the aggregate event stream.`,
            `${eventName}`,
            `${lastUncommittedEventName}`
          )
        }
      })
    }

    if (flags.includes('has') && ! flags.includes('one') && ! flags.includes('exactly')) {
      //
      events.forEach(event => {
        const eventName = getEventClassName(event)
        const eventCount = occurances(uncommittedEventNames, eventName)

        if ( ! eventCount) {
          throwError(
            `Event '${eventName}' did not match any events in the aggregate stream.`,
          )
        }
      })
    }
  }

  const assertEventParams = (params: Record<string, any>) => {

    // TODO refactor
    // This should look for the last uncommitted matching event name
    // and use this for the evaluation

    if ( ! events.length) {
      throwError(
        `No events listed - cannot assert event includes params`,
      )
    }

    const uncommittedEvents = aggregate.getUncommittedEvents()

    if (flags.includes('last')) {
      const eventName = getEventClassName(events[events.length - 1])
      const lastUncommittedEvent = uncommittedEvents[uncommittedEvents.length - 1]
      const lastUncommittedEventName = getEventProtoName(lastUncommittedEvent)

      Object.keys(params).forEach(prop => {

        if (Array.isArray(lastUncommittedEvent[prop]) && Array.isArray(params[prop])) {
          try {
            expect(lastUncommittedEvent[prop]).to.contain(params[prop])
          }
          catch (error) {
            throwError(
              `No property '${prop}' does not match required list`,
              `${prop} - ${lastUncommittedEvent[prop]}`,
              `${prop} - ${params[prop]}`,
            )
          }
        }
        else if (lastUncommittedEvent[prop] !== params[prop]) {
          throwError(
            `No matching property found on last event '${eventName}' for property '${prop}' with last aggregate event '${lastUncommittedEventName}'`,
            `${prop} - ${lastUncommittedEvent[prop]}`,
            `${prop} - ${params[prop]}`,
          )
        }
      })
      return
    }

    events.forEach(event => {

      const eventName = getEventClassName(event)
      uncommittedEvents.forEach(uncommittedEvent => {

        const lastUncommittedEventName = getEventProtoName(uncommittedEvent)

        if (eventName === lastUncommittedEventName) {

          Object.keys(params).forEach(prop => {

            if (Array.isArray(uncommittedEvent[prop]) && Array.isArray(params[prop])) {
              try {
                expect(uncommittedEvent[prop]).to.contain(params[prop])
              }
              catch (error) {
                throwError(
                  `No property '${prop}' does not match required list`,
                  `${prop} - ${uncommittedEvent[prop]}`,
                  `${prop} - ${params[prop]}`,
                )
              }
            }
            else if (uncommittedEvent[prop] !== params[prop]) {
              throwError(
                `No matching property found on event '${eventName}' for property '${prop}'`,
                `${prop} - ${uncommittedEvent[prop]}`,
                `${prop} - ${params[prop]}`,
              )
            }
          })
        }
      })
    })
  }

  const assertWhen = async (fn: WhenCallback | AfterCallback, async = false) => {
    if (flags.includes('throws')) {
  
      let didThrow = false

      try {
        if (async) {
          await fn(aggregate)
        }
        else {
          fn(aggregate)
        }
      }
      catch (error) {
        didThrow = true

        const left = String(error?.message).toLowerCase()
        const right = String(withMessage).toLowerCase()

        if (withMessage && ! left.includes(right)) {
          throwError(
            `Expected error message did not match`,
            error?.message,
            withMessage,
          )
        }
      }

      if ( ! didThrow) {
        throwError(
          `Failed to throw error for aggregate method`,
        )
      }
      return
    }

    if (async) {
      await fn(aggregate)
    }
    else {
      fn(aggregate)
    }
  }

  const api = {
    loads: (eventStream: IEvent[]) => {
      aggregate.loadFromHistory(eventStream)
      return api
    },
    when: (fn: WhenCallback) => {
      assertWhen(fn)
      return api
    },
    after: async (fn: AfterCallback | AfterCallback[]) => {
      const fnList = Array.isArray(fn) ? fn : [fn]
      for (const func of fnList) {
        await assertWhen(func, true)
      }
      return api
    },
    with: (value: string) => {
      withMessage = value
      return api
    },
    event: (event: IEvent) => {
      addEvents(event)
      assertEvent()
      return api
    },
    events: (events: IEvent | IEvent[]) => {
      addEvents(events)
      assertEvent()
      return api
    },
    includes: (params: Record<string, any>) => {
      assertEventParams(params)
      return api
    },
    exactly: (occurances: number) => {
      flags.push('exactly')
      occuranceExpectation = occurances
      return api
    },
    // TODO - add test case
    getAggregate: () => {
      return aggregate
    },
    get debug () {
      flags.push('debug')
      return api
    },
    get throws () {
      flags.push('throws')
      return api
    },
    get has () {
      flags.push('has')
      return api
    },
    get first () {
      flags.push('first')
      return api
    },
    get last () {
      flags.push('last')
      return api
    },
    get one () {
      flags.push('one')
      return api
    },
    get excludes () {
      flags.push('excludes')
      return api
    },
    get and () {
      return check(aggregate)
    },
    get that () {
      return api
    },
    get it () {
      return api
    },
  }

  return api
}
