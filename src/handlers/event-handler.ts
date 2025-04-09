import { Event } from '../types/events'
import { DiscordClient } from '../core/discord/client'

export const createEventHandler = (discordClient: DiscordClient) => {
  return async (event: Event): Promise<void> => {
    console.log('Processing event:', {
      type: event.type,
      channel: event.channel,
      messageCount: event.messages.length,
    })
    
    for (const message of event.messages) {
      console.log(`[${message.role}] ${message.content}`)
    }

    await discordClient.sendMessage(event.channel, 'Message received!')
  }
} 