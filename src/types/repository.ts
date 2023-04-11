import { AggregateRoot } from '../aggregate'
import { ID } from '@recodedecode/types'


export interface LoadOptions {
  unlocked?: boolean
}

export interface IRepository<T extends AggregateRoot> {
  create: (aggregateId?: ID) => Promise<T>
  load: (aggregateId: ID, options?: LoadOptions) => Promise<T>
  loadFromSnapshot: (aggregateId: ID, options?: LoadOptions) => Promise<T>
  commit: (aggregate: T) => Promise<void>
}

export interface IStore<T extends AggregateRoot> {
  create: (aggregateId?: ID) => Promise<T>
  load: (aggregateId: ID) => Promise<T>
  commit: (aggregate: T) => Promise<void>
}

export interface IEventCommit {
  stream: string
  aggregate_id: string
  commit_id: string
  commit_index: number
  commit_link: string
  created_at: string
  event_type: string
  event_data: string
}

export interface IEventState {
  stream: string
  aggregate_id: string
  updated_at: string
  event_type: string
  event_data: string
}

