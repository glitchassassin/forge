import { logger } from '../../core/logger'
import { discordClient } from '../client'
import { findOrCreateForgeChannel } from '../utils/channel-utils'
import { sendMessage } from './send-message'

let statusChannelId: string | undefined

export const logStatus = async (content: string): Promise<void> => {
	try {
		// If we don't have a cached status channel ID, find or create one
		if (!statusChannelId) {
			const guilds = await discordClient.client.guilds.fetch()
			const guild = guilds.first()

			if (!guild) {
				throw new Error('No guilds found for the bot')
			}

			// Get the full guild object to access channels
			const fullGuild = await discordClient.client.guilds.fetch(guild.id)
			statusChannelId = await findOrCreateForgeChannel(fullGuild, 'status')
		}

		// Send the message to the status channel
		if (statusChannelId) {
			await sendMessage(statusChannelId, content)
		} else {
			throw new Error('Status channel ID is not set')
		}
	} catch (error) {
		logger.error('Error logging status', { error })
		// Fallback to console if status channel fails
		logger.info('Status message:', { content })
	}
}
