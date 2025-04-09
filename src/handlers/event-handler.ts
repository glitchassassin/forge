import { Event } from '../types/events'

export async function handleEvent(event: Event): Promise<void> {
  console.log('Processing event:', {
    type: event.type,
    channel: event.channel,
    messageCount: event.messages.length,
  })
  
  for (const message of event.messages) {
    console.log(`[${message.role}] ${message.content}`)
  }
} 