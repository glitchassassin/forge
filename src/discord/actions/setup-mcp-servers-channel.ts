import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	type ModalSubmitInteraction,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js'
import { logger } from '../../core/logger'
import { prisma } from '../../db'
import { discordClient } from '../client'
import { findOrCreateForgeChannel } from '../utils/channel-utils'
import { refreshToolsChannel } from './setup-mcp-tools-channel'

// Button IDs
const BUTTON_IDS = {
	ADD_SERVER: 'mcp-add-server',
	EDIT_SERVER: 'mcp-edit-server',
	DELETE_SERVER: 'mcp-delete-server',
} as const

// Modal IDs
const MODAL_IDS = {
	ADD_SERVER: 'mcp-add-server-modal',
	EDIT_SERVER: 'mcp-edit-server-modal',
} as const

// Helper function to create server message
function serverMessage(server: {
	id: string
	url: string
	authToken?: string | null
}) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${BUTTON_IDS.EDIT_SERVER}|${server.id}`)
			.setLabel('Edit')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId(`${BUTTON_IDS.DELETE_SERVER}|${server.id}`)
			.setLabel('Delete')
			.setStyle(ButtonStyle.Danger),
	)

	const embed = new EmbedBuilder()
		.setTitle('MCP Server')
		.setDescription(`URL: ${server.url}`)
		.setColor(0x00ff00)

	if (server.authToken) {
		embed.addFields({ name: 'Auth Token', value: '••••••••' })
	}

	return {
		embeds: [embed],
		components: [row],
	}
}

// Helper function to send initial channel message
async function sendInitialMessage(channel: TextChannel) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(BUTTON_IDS.ADD_SERVER)
			.setLabel('Add Server')
			.setStyle(ButtonStyle.Success),
	)

	await channel.send({
		embeds: [
			new EmbedBuilder()
				.setTitle('MCP Servers')
				.setDescription(
					'This channel displays all registered MCP servers. Use the buttons below to manage servers.',
				)
				.setColor(0x00ff00),
		],
		components: [row],
	})
}

// Helper function to create server modal
function createServerModal(
	modalId: string,
	title: string,
	url: string = '',
	authToken: string = '',
) {
	const modal = new ModalBuilder().setCustomId(modalId).setTitle(title)

	const urlInput = new TextInputBuilder()
		.setCustomId('url')
		.setLabel('Server URL')
		.setPlaceholder('https://example.com')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(url)

	const authTokenInput = new TextInputBuilder()
		.setCustomId('authToken')
		.setLabel('Auth Token (Optional)')
		.setPlaceholder('Leave empty if no auth token is required')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setValue(authToken)

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(authTokenInput),
	)

	return modal
}

// Helper function to refresh channel messages
async function refreshChannelMessages(channel: TextChannel) {
	await channel.messages
		.fetch()
		.then((messages) => Promise.all(messages.map((msg) => msg.delete())))
	await sendInitialMessage(channel)
	const servers = await prisma.mcpServer.findMany()
	for (const server of servers) {
		await channel.send(serverMessage(server))
	}
}

// Button interaction handler
async function handleButtonInteraction(interaction: ButtonInteraction) {
	const [action, serverId] = interaction.customId.split('|')

	if (
		!action ||
		!serverId ||
		!(
			[
				BUTTON_IDS.ADD_SERVER,
				BUTTON_IDS.EDIT_SERVER,
				BUTTON_IDS.DELETE_SERVER,
			] as string[]
		).includes(action)
	) {
		return // not for us
	}

	switch (action) {
		case BUTTON_IDS.ADD_SERVER:
			logger.info('Add server button pressed')
			const addModal = createServerModal(MODAL_IDS.ADD_SERVER, 'Add MCP Server')
			await interaction.showModal(addModal)
			break

		case BUTTON_IDS.EDIT_SERVER:
			if (!serverId) {
				await interaction.reply({
					content: 'Invalid server ID',
					ephemeral: true,
				})
				return
			}
			logger.info('Edit server button pressed', { serverId })
			const server = await prisma.mcpServer.findUnique({
				where: { id: serverId },
			})
			if (!server) {
				await interaction.reply({
					content: 'Server not found',
					ephemeral: true,
				})
				return
			}
			const editModal = createServerModal(
				`${MODAL_IDS.EDIT_SERVER}:${serverId}`,
				'Edit MCP Server',
				server.url,
			)
			await interaction.showModal(editModal)
			break

		case BUTTON_IDS.DELETE_SERVER:
			if (!serverId) {
				await interaction.reply({
					content: 'Invalid server ID',
					ephemeral: true,
				})
				return
			}
			logger.info('Delete server button pressed', { serverId })

			try {
				await prisma.mcpServer.delete({
					where: { id: serverId },
				})

				// Delete the server message
				await interaction.message.delete()

				// Refresh the tools channel since tools may have been deleted
				await refreshToolsChannel()
			} catch (error) {
				logger.error('Error deleting server', { error, serverId })
				await interaction.reply({
					content: 'Failed to delete server',
					ephemeral: true,
				})
			}
			break

		default:
			return
	}
}

// Modal submit handler
async function handleModalSubmit(interaction: ModalSubmitInteraction) {
	const [action, serverId] = interaction.customId.split('|')

	try {
		switch (action) {
			case MODAL_IDS.ADD_SERVER:
			case MODAL_IDS.EDIT_SERVER:
				const url = interaction.fields.getTextInputValue('url')
				const authToken =
					interaction.fields.getTextInputValue('authToken') || null

				// Validate URL
				try {
					new URL(url)
				} catch {
					await interaction.reply({
						content: 'Please enter a valid URL (e.g., https://example.com)',
						ephemeral: true,
					})
					return
				}

				if (action === MODAL_IDS.ADD_SERVER) {
					// Check for duplicate URL
					const existingServer = await prisma.mcpServer.findFirst({
						where: { url },
					})
					if (existingServer) {
						await interaction.reply({
							content: 'A server with this URL already exists',
							ephemeral: true,
						})
						return
					}

					const newServer = await prisma.mcpServer.create({
						data: {
							url,
							authToken,
						},
					})

					await interaction.deferReply()
					if (interaction.channel instanceof TextChannel) {
						await interaction.channel.send(serverMessage(newServer))
					}
					await interaction.deleteReply()
				} else {
					if (!serverId) {
						throw new Error('Server ID not provided')
					}

					// Check for duplicate URL (excluding current server)
					const duplicateServer = await prisma.mcpServer.findFirst({
						where: {
							url,
							id: { not: serverId },
						},
					})
					if (duplicateServer) {
						await interaction.reply({
							content: 'A server with this URL already exists',
							ephemeral: true,
						})
						return
					}

					const updateData: { url: string; authToken?: string | null } = {
						url,
						authToken,
					}

					const updatedServer = await prisma.mcpServer.update({
						where: { id: serverId },
						data: updateData,
					})

					await interaction.deferReply()
					if (interaction.channel instanceof TextChannel) {
						const messages = await interaction.channel.messages.fetch()
						const serverMessage = messages.find(
							(msg) =>
								msg.embeds[0]?.data.title === 'MCP Server' &&
								msg.components[0]?.components.some(
									(comp) =>
										'custom_id' in comp.data &&
										comp.data.custom_id?.startsWith(
											`${BUTTON_IDS.EDIT_SERVER}:${serverId}`,
										),
								),
						)

						if (serverMessage) {
							const embed = new EmbedBuilder()
								.setTitle('MCP Server')
								.setDescription(`URL: ${updatedServer.url}`)
								.setColor(0x00ff00)

							if (updatedServer.authToken) {
								embed.addFields({ name: 'Auth Token', value: '••••••••' })
							}

							await serverMessage.edit({
								embeds: [embed],
							})
						}
					}
					await interaction.deleteReply()
				}
				break

			default:
				return
		}
	} catch (error) {
		logger.error('Error handling modal submission', { error })
		await interaction.reply({
			content: 'An error occurred while processing your request.',
			ephemeral: true,
		})
	}
}

export const setupMCPServersChannel = async (): Promise<void> => {
	try {
		const guilds = await discordClient.client.guilds.fetch()
		const guild = guilds.first()

		if (!guild) {
			throw new Error('No guilds found for the bot')
		}

		// Get the full guild object to access channels
		const fullGuild = await discordClient.client.guilds.fetch(guild.id)

		// Create or find the channel
		const channelId = await findOrCreateForgeChannel(fullGuild, 'mcp-servers')
		const channel = await fullGuild.channels.fetch(channelId)
		if (!channel?.isTextBased() || !(channel instanceof TextChannel)) {
			throw new Error('Failed to create MCP servers channel')
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
			} else if (interaction.isModalSubmit()) {
				await handleModalSubmit(interaction)
			}
		})

		// Initial channel setup
		await refreshChannelMessages(channel)

		logger.info('MCP servers channel has been set up successfully')
	} catch (error) {
		logger.error('Error setting up MCP servers channel', { error })
		throw error // Re-throw to handle in the caller
	}
}
