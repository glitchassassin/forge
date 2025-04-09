import { type CoreMessage } from 'ai'

export type EventType = 'discord' | 'scheduled'

export type Event = {
  type: EventType
  channel: string
  messages: CoreMessage[]
} 