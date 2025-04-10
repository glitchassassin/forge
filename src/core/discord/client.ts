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
import { type Event } from '../../types/events'
import {
	addChannel,
	channelExists,
	clearChannelContext,
	deleteScheduledEvent,
	getDueScheduledEvents,
} from '../database'
import {
	createCollapsibleMessage,
	getCollapsibleMessage,
	toggleCollapsibleMessage,
} from '../database/collapsible-messages'

const COMMANDS = [
	{
		name: 'monitor',
		description: 'Start monitoring this channel for messages',
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
]

export class DiscordClient {
	private client: Client
	private rest: REST
	private messageHandler?: (event: Event) => void
	private token: string

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
			console.log(`Logged in as ${this.client.user?.tag}`)
		})

		this.client.on('interactionCreate', async (interaction) => {
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
			// Ignore bot messages and non-monitored channels
			if (message.author.bot || !(await channelExists(message.channelId)))
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
			await response.update({ components: [], content: '_Running tool..._' })

			return response.customId === 'approve'
		} catch (error) {
			console.error('Error requesting confirmation:', error)
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
}
