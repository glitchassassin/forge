import { Client, GatewayIntentBits, REST, Routes, ChannelType } from 'discord.js'
import { Event, MessageRole } from '../../types/events'

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
  private monitoredChannels: Set<string> = new Set()
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
      if (!interaction.isChatInputCommand()) return

      if (interaction.commandName === 'monitor') {
        const channelId = interaction.channelId
        this.monitoredChannels.add(channelId)
        await interaction.reply({
          content: `Now monitoring this channel for messages.`,
          ephemeral: true,
        })
      }
    })

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages and non-monitored channels
      if (message.author.bot || !this.monitoredChannels.has(message.channelId)) return

      try {
        // Fetch recent messages
        const channel = message.channel
        const messages = await channel.messages.fetch({
          limit: MAX_MESSAGES,
          before: message.id,
        })

        // Filter messages from the last hour and convert to our format
        const oneHourAgo = Date.now() - ONE_HOUR
        const recentMessages = Array.from(messages.values())
          .filter(msg => msg.createdTimestamp > oneHourAgo)
          .map(msg => ({
            role: (msg.author.bot ? 'assistant' : 'user') as MessageRole,
            content: msg.content,
            name: msg.author.username,
          }))
          .reverse() // Reverse to get chronological order

        // Add the current message
        recentMessages.push({
          role: 'user' as MessageRole,
          content: message.content,
          name: message.author.username,
        })

        // Create an event with the message history
        const event: Event = {
          type: 'discord',
          channel: message.channelId,
          messages: recentMessages,
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

      await this.rest.put(
        Routes.applicationCommands(clientId),
        { body: COMMANDS },
      )
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
} 