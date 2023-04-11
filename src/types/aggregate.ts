
export interface IEvent { } // eslint-disable-line

interface INodeMetadata {
  id: string
  index: number
}

export interface IEventNode <EventBase extends IEvent = IEvent>{
  event: EventBase
  metadata: INodeMetadata
}

export interface IModel {
  id: string,
  [key: string]: any,
}

export type IAggregateFailureHandler = (error: Error) => void

export interface IAggregateRoot<M extends IModel> {
  id: string
  apply: (event: IEvent, isFromHistory?: boolean) => void
  commit: () => void
  getUncommittedEvents: () => IEvent[]
  getLoadedEvents: () => IEvent[]
  getLoadedEventNodes: () => IEventNode<IEvent>[]
  getState: () => M
  loadFromHistory: (history: IEvent[]) => void
  loadFromEventNodes: (history: IEventNode<IEvent>[]) => void
  uncommit: () => void
  snapshot: () => IEvent | void
  setFailureHandler: (handler: IAggregateFailureHandler) => void
}
