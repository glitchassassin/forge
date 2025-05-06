import { TextChannel } from 'discord.js'
import { logger } from '../../core/logger'
import { discordClient } from '../client'
import { findOrCreateForgeChannel } from '../utils/channel-utils'

export const setupMCPToolsChannel = async (): Promise<void> => {
	try {
		const guilds = await discordClient.client.guilds.fetch()
		const guild = guilds.first()

		if (!guild) {
			throw new Error('No guilds found for the bot')
		}

		// Get the full guild object to access channels
		const fullGuild = await discordClient.client.guilds.fetch(guild.id)

		// Create or find the channel
		const channelId = await findOrCreateForgeChannel(fullGuild, 'mcp-tools')
		const channel = await fullGuild.channels.fetch(channelId)
		if (!channel?.isTextBased() || !(channel instanceof TextChannel)) {
			throw new Error('Failed to create MCP tools channel')
		}

		// Set up channel permissions
		await channel.permissionOverwrites.create(fullGuild.roles.everyone, {
			SendMessages: false,
			AddReactions: false,
		})
		await channel.permissionOverwrites.create(discordClient.client.user!, {
			SendMessages: true,
			AddReactions: true,
		})

		// Clear existing messages
		await channel.messages
			.fetch()
			.then((messages) => Promise.all(messages.map((msg) => msg.delete())))

		// Send initial embed
		await channel.send({
			embeds: [
				{
					title: 'MCP Tools',
					description:
						'This channel displays all registered tools. Use the buttons below to manage tool settings.',
					color: 0x00ff00,
				},
			],
		})

		logger.info('MCP tools channel has been set up successfully')
	} catch (error) {
		logger.error('Error setting up MCP tools channel', { error })
		throw error // Re-throw to handle in the caller
	}
}
