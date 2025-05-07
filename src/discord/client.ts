import { Client, GatewayIntentBits, REST, Routes } from 'discord.js'
import { logger } from '../core/logger'
import { prisma } from '../db'
import { ensureConversation } from '../db/ensureConversation'
import { logStatus } from './actions/log-status'
import { newChannelCommand } from './commands/new-channel'
import { type Command } from './types/commands'

export class DiscordClient {
	public client: Client
	private rest: REST
	private token: string
	public readonly commands: Record<string, Command> = {
		new: newChannelCommand,
	}

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
		await logStatus(`Forge is online.`)
	}

	private setupEventHandlers(): void {
		this.client.on('ready', () => {
			logger.info(`Logged in as ${this.client.user?.tag}`)
		})

		this.client.on('interactionCreate', async (interaction) => {
			if (!interaction.isChatInputCommand()) return

			const command = this.commands[interaction.commandName]
			if (!command) {
				logger.error('Unknown command', {
					commandName: interaction.commandName,
				})
				return
			}

			const guild = await this.client.guilds.fetch(interaction.guildId!)
			await command.execute(interaction, guild)
		})

		this.client.on('messageCreate', async (message) => {
			// Ignore bot messages, non-monitored channels, and if inactive
			if (message.author.bot) return

			await ensureConversation(message.channelId)
			await prisma.message.create({
				data: {
					conversationId: message.channelId,
					role: 'user',
					content: `<discord_message><username>${message.author.username}</username><user_id>${message.author.id}</user_id><content>${message.content}</content></discord_message>`,
				},
			})
		})
	}

	private async registerCommands(): Promise<void> {
		try {
			const clientId = this.client.user?.id
			if (!clientId) throw new Error('Client not ready')

			await this.rest.put(Routes.applicationCommands(clientId), {
				body: Object.values(this.commands).map((command) => command.metadata),
			})
			logger.info('Successfully registered slash commands')
		} catch (error) {
			logger.error('Error registering commands', { error })
		}
	}
}

export const discordClient = new DiscordClient()
