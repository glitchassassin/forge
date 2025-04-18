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
import { randomUUID } from 'node:crypto'
import { AgentMessage, Message } from '../agent-framework/types'
import { config } from '../config'
import { logger } from '../core/logger'
import { triggerUpdate } from '../utils/process'
import { TypedEventEmitter } from '../utils/typed-event-emitter'

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
	/**
	 * @description Event emitter for tool call confirmations
	 * Valid events:
	 * - toolCallConfirmation
	 * - message
	 */
	public emitter = new TypedEventEmitter<{
		toolCallConfirmation: [toolCallId: string, approved: boolean]
		message: [message: Message]
	}>()
	private token: string
	private isActive: boolean = true
	private statusChannelId?: string

	constructor() {
		if (!process.env.DISCORD_TOKEN) {
			throw new Error('DISCORD_TOKEN is not set')
		}
		this.token = process.env.DISCORD_TOKEN
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
			],
		})
		this.rest = new REST().setToken(this.token)

		this.setupEventHandlers()
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
			// Handle button interactions for tool call confirmations
			if (interaction.isButton()) {
				const [action, toolCallId] = interaction.customId.split('|')
				if (toolCallId && (action === 'approve' || action === 'reject')) {
					// Remove the buttons after response
					await interaction.update({
						components: [],
						content: '_Running tool..._',
					})

					// Emit the tool call confirmation event
					this.emitter.emit(
						'toolCallConfirmation',
						toolCallId,
						action === 'approve',
					)
					return
				}
			}

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

			if (!interaction.isChatInputCommand()) return

			if (interaction.commandName === 'new') {
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
			} else if (interaction.commandName === 'update') {
				await interaction.reply({
					content:
						'Starting update process... The bot will restart automatically.',
					flags: MessageFlags.Ephemeral,
				})

				// Trigger the update process
				triggerUpdate()
			}
		})

		this.client.on('messageCreate', async (message) => {
			// Ignore bot messages, non-monitored channels, and if inactive
			if (message.author.bot || !this.isActive) return

			try {
				// Create an event with the message history
				const event: AgentMessage = {
					id: randomUUID(),
					created_at: new Date(),
					handled: false,
					type: 'agent',
					conversation: message.channelId,
					body: [
						{
							role: 'user',
							content: `${message.author.toString()}: ${message.content}`,
						},
					],
				}

				// Call the message handler if it exists
				this.emitter.emit('message', event)
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

	public async requestApproval(
		channelId: string,
		content: string,
		toolCallId: string,
	): Promise<void> {
		const channel = await this.client.channels.fetch(channelId)
		if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
			throw new Error(`Channel ${channelId} is not a text channel`)
		}

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`approve|${toolCallId}`)
				.setLabel('Approve')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`reject|${toolCallId}`)
				.setLabel('Reject')
				.setStyle(ButtonStyle.Danger),
		)

		await channel.send({
			content,
			components: [row],
		})
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

	public async logStatus(content: string): Promise<void> {
		try {
			// If we don't have a cached status channel ID, find or create one
			if (!this.statusChannelId) {
				const guilds = await this.client.guilds.fetch()
				const guild = guilds.first()

				if (!guild) {
					throw new Error('No guilds found for the bot')
				}

				// Get the full guild object to access channels
				const fullGuild = await this.client.guilds.fetch(guild.id)

				// Find or create the status channel
				const channels = await fullGuild.channels.fetch()
				let statusChannel = channels.find(
					(channel): channel is NonNullable<typeof channel> =>
						channel?.name === 'status' &&
						channel.type === ChannelType.GuildText,
				)

				if (!statusChannel) {
					// Find or create the forge category
					let forgeCategory = channels.find(
						(channel): channel is NonNullable<typeof channel> =>
							channel?.type === ChannelType.GuildCategory &&
							channel.name.toLowerCase() === 'forge',
					)

					if (!forgeCategory) {
						forgeCategory = await fullGuild.channels.create({
							name: 'forge',
							type: ChannelType.GuildCategory,
						})
					}

					statusChannel = await fullGuild.channels.create({
						name: 'status',
						type: ChannelType.GuildText,
						parent: forgeCategory.id,
					})
				}

				if (!statusChannel) {
					throw new Error('Failed to create or find status channel')
				}

				this.statusChannelId = statusChannel.id
			}

			// Send the message to the status channel
			if (this.statusChannelId) {
				await this.sendMessage(this.statusChannelId, content)
			} else {
				throw new Error('Status channel ID is not set')
			}
		} catch (error) {
			logger.error('Error logging status', { error })
			// Fallback to console if status channel fails
			logger.info('Status message:', { content })
		}
	}
}
