import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	TextChannel,
} from 'discord.js'
import { logger } from '../../core/logger'
import { prisma } from '../../db'
import { discordClient } from '../client'
import { findOrCreateForgeChannel } from '../utils/channel-utils'

// Button IDs
const BUTTON_IDS = {
	TOGGLE_APPROVAL: 'mcp-toggle-approval',
} as const

// Helper function to create tool message
function toolMessage(tool: {
	id: string
	name: string
	requiresApproval: boolean
	mcpServer: {
		url: string
	}
}) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${BUTTON_IDS.TOGGLE_APPROVAL}|${tool.id}`)
			.setLabel(tool.requiresApproval ? 'Disable Approval' : 'Enable Approval')
			.setStyle(
				tool.requiresApproval ? ButtonStyle.Danger : ButtonStyle.Success,
			),
	)

	const embed = new EmbedBuilder()
		.setTitle(tool.name)
		.setDescription(tool.mcpServer.url)
		.addFields({
			name: 'Requires Approval',
			value: tool.requiresApproval ? '✅' : '❌',
		})
		.setColor(0x00ff00)

	return {
		embeds: [embed],
		components: [row],
	}
}

// Helper function to send initial channel message
async function sendInitialMessage(channel: TextChannel) {
	await channel.send({
		embeds: [
			new EmbedBuilder()
				.setTitle('MCP Tools')
				.setDescription(
					'This channel displays all registered tools. Use the buttons below to manage tool settings.',
				)
				.setColor(0x00ff00),
		],
	})
}

// Helper function to refresh channel messages
async function refreshChannelMessages(channel: TextChannel) {
	await channel.messages
		.fetch()
		.then((messages) => Promise.all(messages.map((msg) => msg.delete())))
	await sendInitialMessage(channel)
	const tools = await prisma.tool.findMany({
		include: {
			mcpServer: true,
		},
	})
	for (const tool of tools) {
		await channel.send(toolMessage(tool))
	}
}

// Button interaction handler
async function handleButtonInteraction(interaction: ButtonInteraction) {
	const [action, toolId] = interaction.customId.split('|')

	switch (action) {
		case BUTTON_IDS.TOGGLE_APPROVAL:
			if (!toolId) {
				await interaction.reply({
					content: 'Invalid tool ID',
					ephemeral: true,
				})
				return
			}
			logger.info('Toggle approval button pressed', { toolId })

			try {
				const tool = await prisma.tool.findUnique({
					where: { id: toolId },
				})

				if (!tool) {
					await interaction.reply({
						content: 'Tool not found',
						ephemeral: true,
					})
					return
				}

				const updatedTool = await prisma.tool.update({
					where: { id: toolId },
					include: {
						mcpServer: true,
					},
					data: {
						requiresApproval: !tool.requiresApproval,
					},
				})

				// Update the message
				await interaction.message.edit(toolMessage(updatedTool))
				await interaction.deferUpdate()
			} catch (error) {
				logger.error('Error toggling tool approval', { error, toolId })
				await interaction.reply({
					content: 'Failed to toggle tool approval',
					ephemeral: true,
				})
			}
			break

		default:
			return
	}
}

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

		// Set up interaction handlers
		discordClient.client.on('interactionCreate', async (interaction) => {
			if (interaction.isButton()) {
				await handleButtonInteraction(interaction)
			}
		})

		// Initial channel setup
		await refreshChannelMessages(channel)

		logger.info('MCP tools channel has been set up successfully')
	} catch (error) {
		logger.error('Error setting up MCP tools channel', { error })
		throw error // Re-throw to handle in the caller
	}
}

// Export refresh function for use in other modules
export const refreshToolsChannel = async (): Promise<void> => {
	try {
		const guilds = await discordClient.client.guilds.fetch()
		const guild = guilds.first()

		if (!guild) {
			throw new Error('No guilds found for the bot')
		}

		const fullGuild = await discordClient.client.guilds.fetch(guild.id)
		const channelId = await findOrCreateForgeChannel(fullGuild, 'mcp-tools')
		const channel = await fullGuild.channels.fetch(channelId)

		if (!channel?.isTextBased() || !(channel instanceof TextChannel)) {
			throw new Error('Failed to find MCP tools channel')
		}

		await refreshChannelMessages(channel)
	} catch (error) {
		logger.error('Error refreshing tools channel', { error })
		throw error
	}
}
