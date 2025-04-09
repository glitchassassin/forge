import 'dotenv/config'
import { Database } from './core/database'
import { DiscordClient } from './core/discord/client'
import { EventQueue } from './core/event-queue'
import { createEventHandler } from './handlers/event-handler'
import { checkAndPublishScheduledEvents } from './tools/schedule'

if (!process.env.DISCORD_TOKEN) {
	console.error('DISCORD_TOKEN is not set in .env file')
	process.exit(1)
}

const db = new Database()
const discordClient = new DiscordClient(process.env.DISCORD_TOKEN, db)
const handleEvent = createEventHandler(discordClient, db)
const eventQueue = new EventQueue(handleEvent)

// Wire up the Discord client to the event queue
discordClient.onMessage((event) => eventQueue.add(event))

// Check for scheduled events every minute
setInterval(() => checkAndPublishScheduledEvents(db, eventQueue), 60 * 1000)

discordClient.start().catch((error) => {
	console.error('Failed to start Discord client:', error)
	process.exit(1)
})
