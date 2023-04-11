import { nextFlakeId } from '@recodedecode/nest-method'
import { ID } from '@recodedecode/types'

import {
  IAggregateRoot,
  IAggregateFailureHandler,
  IEvent,
  IEventNode,
  IModel
} from '../types'


const INTERNAL_EVENTS = Symbol()
const INTERNAL_EVENTS_HISTORY = Symbol()
const INTERNAL_EVENTS_NODES_HISTORY = Symbol()
const FAILURE_HANDLER = Symbol()

export type IAggrgateClass<T extends AggregateRoot> = new (aggregateId?: ID) => T 

export class AggregateRoot<Model extends IModel = IModel, EventBase extends IEvent = IEvent> implements IAggregateRoot<Model> {

  private readonly [INTERNAL_EVENTS]: EventBase[] = []
  private readonly [INTERNAL_EVENTS_HISTORY]: EventBase[] = []
  private readonly [INTERNAL_EVENTS_NODES_HISTORY]: IEventNode[] = []
  private [FAILURE_HANDLER]: IAggregateFailureHandler = null
  protected state: Model

  constructor (
    public readonly id: string = nextFlakeId()
  ) { }

  public getState (): Model {
    return this.state
  }

  public commit () {
    this[INTERNAL_EVENTS].length = 0
  }

  public uncommit () {
    this[INTERNAL_EVENTS].length = 0
  }
  
  public getUncommittedEvents () {
    return this[INTERNAL_EVENTS]
  }

  public getLoadedEvents () {
    return this[INTERNAL_EVENTS_HISTORY]
  }

  public getLoadedEventNodes () {
    return this[INTERNAL_EVENTS_NODES_HISTORY]
  }

  public loadFromHistory (history: EventBase[]) {
    history.forEach((event) => {
      this.apply(event, true)
      this[INTERNAL_EVENTS_HISTORY].push(event)
    })
  }

  public loadFromEventNodes (nodes: IEventNode<EventBase>[]) {
    nodes.forEach((node) => {
      this.apply(node.event, true)
      this[INTERNAL_EVENTS_NODES_HISTORY].push(node)
    })
    const events = nodes.map(node => node.event)
    this.loadFromHistory(events)
  }

  public snapshot (): IEvent | void {
    return
  }

  public apply <T extends EventBase = EventBase>(event: T, isFromHistory = false) {
    if ( ! isFromHistory) {
      this[INTERNAL_EVENTS].push(event)
    }

    const handler = this.getEventHandler(event)
    handler && handler.call(this, event)
  }

  protected getEventHandler <T extends EventBase = EventBase>(
    event: T,
  ): (...args: any) => void | undefined {
    const handler = `on${this.getEventName(event)}`
    return this[handler]
  }

  protected getEventName (event: any): string {
    const { constructor } = Object.getPrototypeOf(event)
    return constructor.name as string
  }

  protected getEventClassName (event: any): string {
    return event.name as string
  }

  public setFailureHandler (handler: IAggregateFailureHandler) {
    this[FAILURE_HANDLER] = handler
  }

  public fail (error: Error) {
    if (this[FAILURE_HANDLER]) {
      this[FAILURE_HANDLER](error)
      return
    }
    throw error
  }

}
