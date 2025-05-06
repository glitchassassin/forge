import { TextChannel } from 'discord.js'
import { logger } from '../../core/logger'
import { discordClient } from '../client'
import { findOrCreateForgeChannel } from '../utils/channel-utils'

export const setupAdminChannels = async (): Promise<void> => {
	try {
		const guilds = await discordClient.client.guilds.fetch()
		const guild = guilds.first()

		if (!guild) {
			throw new Error('No guilds found for the bot')
		}

		// Get the full guild object to access channels
		const fullGuild = await discordClient.client.guilds.fetch(guild.id)

		// Create or find the MCP servers channel
		const serversChannelId = await findOrCreateForgeChannel(
			fullGuild,
			'mcp-servers',
		)
		const serversChannel = await fullGuild.channels.fetch(serversChannelId)
		if (
			!serversChannel?.isTextBased() ||
			!(serversChannel instanceof TextChannel)
		) {
			throw new Error('Failed to create MCP servers channel')
		}

		// Create or find the MCP tools channel
		const toolsChannelId = await findOrCreateForgeChannel(
			fullGuild,
			'mcp-tools',
		)
		const toolsChannel = await fullGuild.channels.fetch(toolsChannelId)
		if (
			!toolsChannel?.isTextBased() ||
			!(toolsChannel instanceof TextChannel)
		) {
			throw new Error('Failed to create MCP tools channel')
		}

		// Clear existing messages in both channels
		await serversChannel.messages
			.fetch()
			.then((messages) => Promise.all(messages.map((msg) => msg.delete())))
		await toolsChannel.messages
			.fetch()
			.then((messages) => Promise.all(messages.map((msg) => msg.delete())))

		// Send initial embeds
		await serversChannel.send({
			embeds: [
				{
					title: 'MCP Servers',
					description:
						'This channel displays all registered MCP servers. Use the buttons below to manage servers.',
					color: 0x00ff00,
				},
			],
		})

		await toolsChannel.send({
			embeds: [
				{
					title: 'MCP Tools',
					description:
						'This channel displays all registered tools. Use the buttons below to manage tool settings.',
					color: 0x00ff00,
				},
			],
		})

		logger.info('MCP admin channels have been set up successfully')
	} catch (error) {
		logger.error('Error setting up MCP admin channels', { error })
		throw error // Re-throw to handle in the caller
	}
}
