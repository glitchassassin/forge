import 'dotenv/config'
import { EventQueue } from './core/event-queue'
import { DiscordClient } from './core/discord/client'
import { createEventHandler } from './handlers/event-handler'

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is not set in .env file')
  process.exit(1)
}

const discordClient = new DiscordClient(process.env.DISCORD_TOKEN)
const handleEvent = createEventHandler(discordClient)
const eventQueue = new EventQueue(handleEvent)

// Wire up the Discord client to the event queue
discordClient.onMessage(event => eventQueue.add(event))

discordClient.start().catch(error => {
  console.error('Failed to start Discord client:', error)
  process.exit(1)
})