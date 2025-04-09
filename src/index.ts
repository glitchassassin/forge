import { EventQueue } from './core/event-queue'
import { handleEvent } from './handlers/event-handler'

const queue = new EventQueue(handleEvent)

// Example usage
const event = {
  type: 'discord' as const,
  channel: 'test-channel',
  messages: [
    { role: 'user' as const, content: 'Hello, world!' },
    { role: 'assistant' as const, content: 'Hi there!' },
  ],
}

queue.add(event)