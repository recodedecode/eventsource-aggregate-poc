import { IEvent } from '../types'


const createANewNamedClass = (name: string) => ({
  [name] : class { }
})[name]

export const actualizeEvent = <T extends IEvent = IEvent>(
  name: string,
  payload: string,
): T => {
  const EventClass = createANewNamedClass(name)
  const eventActualized = new EventClass()
  const data = JSON.parse(payload)
  Object.keys(data).forEach(key => {
    eventActualized[key] = data[key]
  })
  return eventActualized as T
}

export const delay = async (duration = 100): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, duration))
