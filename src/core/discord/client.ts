import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	GatewayIntentBits,
	REST,
	Routes,
} from 'discord.js'
import { type Event } from '../../types/events'
import { type Database } from '../database'

const COMMANDS = [
	{
		name: 'monitor',
		description: 'Start monitoring this channel for messages',
	},
]

const ONE_HOUR = 60 * 60 * 1000
const MAX_MESSAGES = 100

export class DiscordClient {
	private client: Client
	private rest: REST
	private messageHandler?: (event: Event) => void
	private token: string
	private db: Database

	constructor(token: string, db: Database) {
		this.token = token
		this.db = db
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
			console.log(`Logged in as ${this.client.user?.tag}`)
		})

		this.client.on('interactionCreate', async (interaction) => {
			if (!interaction.isChatInputCommand()) return

			if (interaction.commandName === 'monitor') {
				const channelId = interaction.channelId
				await this.db.addChannel(channelId)
				await interaction.reply({
					content: `Now monitoring this channel for messages.`,
					ephemeral: true,
				})
			}
		})

		this.client.on('messageCreate', async (message) => {
			// Ignore bot messages and non-monitored channels
			if (message.author.bot || !this.db.channelExists(message.channelId))
				return

			try {
				// Create an event with the message history
				const event: Event = {
					type: 'discord',
					channel: message.channelId,
					messages: [
						{
							role: 'user',
							content: `@${message.author.username}: ${message.content}`,
						},
					],
				}

				// Call the message handler if it exists
				this.messageHandler?.(event)
			} catch (error) {
				console.error('Error processing message:', error)
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
			console.log('Successfully registered slash commands')
		} catch (error) {
			console.error('Error registering commands:', error)
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
			await response.update({ components: [] })

			return response.customId === 'approve'
		} catch (error) {
			console.error('Error requesting confirmation:', error)
			// Remove the buttons on timeout
			await message.edit({ components: [] })
			return false
		}
	}
}
