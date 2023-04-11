import { IEventState } from '../types'


export const snapshotEvents: IEventState[] = [{
  stream: 'mix',
  aggregate_id: '1234567890',
  updated_at: '2022-10-10T09:00.000Z',
  event_type: 'SnapshotEvent',
  event_data: '{ "state": { "id": "1234567890", "name": "Cassandra", "description": "Cassandra is a free and open-source, distributed, wide-column store." } }',
}]

