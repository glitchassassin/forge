import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	GatewayIntentBits,
	MessageFlags,
	REST,
	Routes,
} from 'discord.js'
import { config } from '../../config'
import { availableModelsWithTools } from '../../config/available-models'
import { type Event } from '../../types/events'
import {
	addChannel,
	channelExists,
	clearChannelContext,
	deleteScheduledEvent,
	getDueScheduledEvents,
	updateChannelModel,
} from '../database'
import {
	createCollapsibleMessage,
	getCollapsibleMessage,
	toggleCollapsibleMessage,
} from '../database/collapsible-messages'
import { logger } from '../logger'

const COMMANDS = [
	{
		name: 'monitor',
		description: 'Start monitoring this channel for messages',
	},
	{
		name: 'new',
		description: 'Create a new forge channel',
	},
	{
		name: 'model',
		description: 'Set the model for this channel',
		options: [
			{
				name: 'model',
				description: 'The model to use',
				type: 3, // STRING
				required: true,
				autocomplete: true,
			},
		],
	},
	{
		name: 'reset',
		description: 'Reset various aspects of the bot',
		options: [
			{
				name: 'type',
				description: 'What to reset',
				type: 3, // STRING
				required: true,
				choices: [
					{
						name: 'History',
						value: 'history',
					},
					{
						name: 'Scheduled Events',
						value: 'events',
					},
					{
						name: 'Everything',
						value: 'all',
					},
				],
			},
		],
	},
	{
		name: 'activate',
		description: 'Activate a specific backend',
		options: [
			{
				name: 'name',
				description: 'The server instance to activate',
				type: 3, // STRING
				required: true,
			},
		],
	},
]

export class DiscordClient {
	private client: Client
	private rest: REST
	private messageHandler?: (event: Event) => void
	private token: string
	private isActive: boolean = true

	constructor(token: string) {
		this.token = token
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
			],
		})
		this.rest = new REST().setToken(token)

		this.setupEventHandlers()
	}

	onMessage(handler: (event: Event) => void): void {
		this.messageHandler = handler
	}

	async start(): Promise<void> {
		await this.client.login(this.token)
		await this.registerCommands()
	}

	private setupEventHandlers(): void {
		this.client.on('ready', () => {
			logger.info(`Logged in as ${this.client.user?.tag}`)
		})

		this.client.on('interactionCreate', async (interaction) => {
			// Handle activate command regardless of active state
			if (
				interaction.isChatInputCommand() &&
				interaction.commandName === 'activate'
			) {
				const name = interaction.options.getString('name', true)
				this.isActive = name === config.name
				await interaction.reply({
					content: this.isActive
						? `Bot "${config.name}" activated.`
						: `Bot "${config.name}" deactivated.`,
					flags: MessageFlags.Ephemeral,
				})
				return
			}

			// Ignore other commands if inactive
			if (!this.isActive) {
				return
			}

			if (interaction.isAutocomplete()) {
				if (interaction.commandName === 'model') {
					const focusedValue = interaction.options.getFocused()
					const filtered = availableModelsWithTools
						.filter((model) =>
							model.id.toLowerCase().includes(focusedValue.toLowerCase()),
						)
						.slice(0, 25)
					await interaction.respond(
						filtered.map((model) => ({
							name: model.name,
							value: model.id,
						})),
					)
				}
				return
			}

			if (
				interaction.isButton() &&
				interaction.customId === 'toggle_collapse'
			) {
				const message = interaction.message
				const collapsibleMessage = await getCollapsibleMessage(message.id)

				if (!collapsibleMessage) {
					await interaction.reply({
						content: 'This message is no longer collapsible.',
						flags: MessageFlags.Ephemeral,
					})
					return
				}

				const newState = !collapsibleMessage.isCollapsed
				await toggleCollapsibleMessage(message.id)

				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId('toggle_collapse')
						.setLabel(newState ? 'Expand' : 'Collapse')
						.setStyle(ButtonStyle.Secondary),
				)

				await interaction.update({
					content: newState
						? collapsibleMessage.collapsedContent
						: collapsibleMessage.content,
					components: [row],
				})
				return
			}

			if (!interaction.isChatInputCommand()) return

			if (interaction.commandName === 'monitor') {
				const channelId = interaction.channelId
				await addChannel(channelId)
				await interaction.reply({
					content: `Now monitoring this channel for messages.`,
					flags: MessageFlags.Ephemeral,
				})
			} else if (interaction.commandName === 'new') {
				if (!interaction.guildId) {
					await interaction.reply({
						content: 'This command can only be used in a server.',
						flags: MessageFlags.Ephemeral,
					})
					return
				}

				try {
					const nextNumber = await this.findNextChannelNumber(
						interaction.guildId,
					)
					const channelId = await this.createForgeChannel(
						interaction.guildId,
						nextNumber,
					)
					await addChannel(channelId)

					await interaction.reply({
						content: `Created new channel <#${channelId}> and started monitoring it.`,
						flags: MessageFlags.Ephemeral,
					})
				} catch (error) {
					logger.error('Error creating new channel', { error })
					await interaction.reply({
						content: 'Failed to create new channel. Please try again later.',
						flags: MessageFlags.Ephemeral,
					})
				}
			} else if (interaction.commandName === 'model') {
				const model = interaction.options.getString('model', true)
				const channelId = interaction.channelId

				await updateChannelModel(channelId, model)

				await interaction.reply({
					content: `Model set to ${model} for this channel.`,
					flags: MessageFlags.Ephemeral,
				})
			} else if (interaction.commandName === 'reset') {
				const resetType = interaction.options.getString('type', true)
				const channelId = interaction.channelId

				let content = ''
				switch (resetType) {
					case 'history':
						await clearChannelContext(channelId)
						content = 'Conversation history has been cleared for this channel.'
						break
					case 'events':
						const events = await getDueScheduledEvents()
						for (const event of events) {
							if (event.channelId === channelId) {
								await deleteScheduledEvent(event.id)
							}
						}
						content = 'All scheduled events for this channel have been cleared.'
						break
					case 'all':
						await clearChannelContext(channelId)
						const allEvents = await getDueScheduledEvents()
						for (const event of allEvents) {
							if (event.channelId === channelId) {
								await deleteScheduledEvent(event.id)
							}
						}
						content =
							'All conversation history and scheduled events have been cleared for this channel.'
						break
				}

				await interaction.reply({
					content,
					flags: MessageFlags.Ephemeral,
				})
			}
		})

		this.client.on('messageCreate', async (message) => {
			// Ignore bot messages, non-monitored channels, and if inactive
			if (
				message.author.bot ||
				!(await channelExists(message.channelId)) ||
				!this.isActive
			)
				return

			try {
				// Create an event with the message history
				const event: Event = {
					type: 'discord',
					channel: message.channelId,
					messages: [
						{
							role: 'user',
							content: `${message.author.toString()}: ${message.content}`,
						},
					],
				}

				// Call the message handler if it exists
				this.messageHandler?.(event)
			} catch (error) {
				logger.error('Error processing message', { error })
			}
		})
	}

	private async registerCommands(): Promise<void> {
		try {
			const clientId = this.client.user?.id
			if (!clientId) throw new Error('Client not ready')

			await this.rest.put(Routes.applicationCommands(clientId), {
				body: COMMANDS,
			})
			logger.info('Successfully registered slash commands')
		} catch (error) {
			logger.error('Error registering commands', { error })
		}
	}

	public async sendMessage(channelId: string, content: string): Promise<void> {
		const channel = await this.client.channels.fetch(channelId)
		if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
			throw new Error(`Channel ${channelId} is not a text channel`)
		}
		await channel.send(content)
	}

	public async startTyping(channelId: string): Promise<void> {
		const channel = await this.client.channels.fetch(channelId)
		if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
			throw new Error(`Channel ${channelId} is not a text channel`)
		}
		await channel.sendTyping()
	}

	public async requestConfirmation(
		channelId: string,
		content: string,
	): Promise<boolean> {
		const channel = await this.client.channels.fetch(channelId)
		if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
			throw new Error(`Channel ${channelId} is not a text channel`)
		}

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('approve')
				.setLabel('Approve')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId('reject')
				.setLabel('Reject')
				.setStyle(ButtonStyle.Danger),
		)

		const message = await channel.send({
			content,
			components: [row],
		})

		try {
			const response = await message.awaitMessageComponent({
				time: 60_000, // 1 minute timeout
			})

			// Remove the buttons after response
			await response.update({ components: [], content: '_Running tool..._' })

			return response.customId === 'approve'
		} catch (error) {
			logger.error('Error requesting confirmation', { error })
			// Remove the buttons on timeout
			await message.edit({
				components: [],
				content: '_Tool request timed out._',
			})
			return false
		}
	}

	public async sendCollapsibleMessage(
		channelId: string,
		content: string,
		collapsedContent: string,
		collapsed: boolean = true,
	): Promise<void> {
		const channel = await this.client.channels.fetch(channelId)
		if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
			throw new Error(`Channel ${channelId} is not a text channel`)
		}

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('toggle_collapse')
				.setLabel(collapsed ? 'Expand' : 'Collapse')
				.setStyle(ButtonStyle.Secondary),
		)

		const message = await channel.send({
			content: collapsed ? collapsedContent : content,
			components: [row],
		})

		await createCollapsibleMessage(
			message.id,
			channelId,
			content,
			collapsedContent,
			collapsed,
		)
	}

	private async findNextChannelNumber(guildId: string): Promise<number> {
		const guild = await this.client.guilds.fetch(guildId)
		if (!guild) throw new Error('Guild not found')

		const channels = await guild.channels.fetch()
		const forgeChannels = channels.filter(
			(channel) =>
				channel?.name.startsWith('forge-') &&
				channel.type === ChannelType.GuildText,
		)

		const numbers = forgeChannels.map((channel) => {
			const match = channel?.name?.match(/forge-(\d+)/)
			return match?.[1] ? parseInt(match[1]) : 0
		})

		let nextNumber = 1
		while (numbers.includes(nextNumber)) {
			nextNumber++
		}

		return nextNumber
	}

	private async createForgeChannel(
		guildId: string,
		number: number,
	): Promise<string> {
		const guild = await this.client.guilds.fetch(guildId)
		if (!guild) throw new Error('Guild not found')

		// Find or create the forge category
		let forgeCategory = guild.channels.cache.find(
			(channel) =>
				channel.type === ChannelType.GuildCategory &&
				channel.name.toLowerCase() === 'forge',
		)

		if (!forgeCategory) {
			forgeCategory = await guild.channels.create({
				name: 'forge',
				type: ChannelType.GuildCategory,
			})
		}

		const channel = await guild.channels.create({
			name: `forge-${number}`,
			type: ChannelType.GuildText,
			parent: forgeCategory.id,
		})

		return channel.id
	}
}
