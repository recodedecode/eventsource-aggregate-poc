import { Repository, Store } from '../services'


export const createRepositoryProvider = (streamName: string, aggregate: any) => [
  { provide: 'Aggregate', useValue: aggregate },
  { provide: 'StreamName', useValue: streamName },
  Repository,
]

export const createStoreProvider = (streamName: string, aggregate: any) => [
  { provide: 'Aggregate', useValue: aggregate },
  { provide: 'StreamName', useValue: streamName },
  Store,
]
