import { Client, REST } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelExists, clearChannelContext, disconnect } from '../database'
import { DiscordClient } from './client'

vi.mock('discord.js', () => ({
	Client: vi.fn().mockImplementation(() => ({
		login: vi.fn().mockResolvedValue(undefined),
		on: vi.fn(),
		user: { id: 'test-client-id' },
	})),
	REST: vi.fn().mockImplementation(() => ({
		setToken: vi.fn().mockReturnThis(),
		put: vi.fn().mockResolvedValue(undefined),
	})),
	GatewayIntentBits: {
		Guilds: 1,
		GuildMessages: 2,
		MessageContent: 3,
	},
	Routes: {
		applicationCommands: (clientId: string) =>
			`/applications/${clientId}/commands`,
	},
	Interaction: {
		prototype: {
			isAutocomplete: vi.fn().mockReturnValue(false),
			isChatInputCommand: vi.fn().mockReturnValue(false),
		},
	},
	MessageFlags: {
		Ephemeral: 64,
	},
}))

describe('DiscordClient', () => {
	let client: DiscordClient
	let mockClient: Client
	let mockRest: REST
	let mockMessageHandler: ReturnType<typeof vi.fn>

	beforeEach(async () => {
		client = new DiscordClient('test-token')
		mockClient = (Client as any).mock.results[
			(Client as any).mock.results.length - 1
		].value
		mockRest = (REST as any).mock.results[(REST as any).mock.results.length - 1]
			.value
		mockMessageHandler = vi.fn()
		client.onMessage(mockMessageHandler)
	})

	afterEach(async () => {
		await clearChannelContext('test-channel')
		await disconnect()
	})

	it('should initialize with correct intents', () => {
		expect(Client).toHaveBeenCalledWith({
			intents: expect.arrayContaining([
				expect.any(Number),
				expect.any(Number),
				expect.any(Number),
			]),
		})
	})

	it('should set up event handlers', () => {
		expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function))
		expect(mockClient.on).toHaveBeenCalledWith(
			'interactionCreate',
			expect.any(Function),
		)
		expect(mockClient.on).toHaveBeenCalledWith(
			'messageCreate',
			expect.any(Function),
		)
	})

	it('should register commands on start', async () => {
		await client.start()
		expect(mockClient.login).toHaveBeenCalledWith('test-token')
		expect(mockRest.put).toHaveBeenCalledWith(
			'/applications/test-client-id/commands',
			{
				body: expect.arrayContaining([
					expect.objectContaining({ name: 'monitor' }),
				]),
			},
		)
	})

	it('should handle monitor command', async () => {
		const mockInteraction = {
			isChatInputCommand: vi.fn().mockReturnValue(true),
			isAutocomplete: vi.fn().mockReturnValue(false),
			isButton: vi.fn().mockReturnValue(false),
			commandName: 'monitor',
			channelId: 'test-channel',
			reply: vi.fn(),
		}

		// Get the interaction handler
		const interactionHandler = (mockClient.on as any).mock.calls.find(
			(call: any) => call[0] === 'interactionCreate',
		)[1]

		await interactionHandler(mockInteraction)

		// Verify the channel was added to the database
		expect(await channelExists('test-channel')).toBe(true)
		expect(mockInteraction.reply).toHaveBeenCalledWith({
			content: 'Now monitoring this channel for messages.',
			flags: 64,
		})
	})

	it('should call message handler with event', async () => {
		// First, monitor the channel
		const mockInteraction = {
			isChatInputCommand: vi.fn().mockReturnValue(true),
			isAutocomplete: vi.fn().mockReturnValue(false),
			isButton: vi.fn().mockReturnValue(false),
			commandName: 'monitor',
			channelId: 'test-channel',
			reply: vi.fn(),
		}

		const interactionHandler = (mockClient.on as any).mock.calls.find(
			(call: any) => call[0] === 'interactionCreate',
		)[1]

		await interactionHandler(mockInteraction)

		// Now send a message to the monitored channel
		const mockMessage = {
			author: {
				bot: false,
				username: 'test-user',
				toString: vi.fn().mockReturnValue('@test-user'),
			},
			channelId: 'test-channel',
			content: 'Hello, world!',
		}

		const messageHandler = (mockClient.on as any).mock.calls.find(
			(call: any) => call[0] === 'messageCreate',
		)[1]

		await messageHandler(mockMessage)

		// Verify the event was created and passed to our handler
		expect(mockMessageHandler).toHaveBeenCalledWith({
			type: 'discord',
			channel: 'test-channel',
			messages: [
				{
					role: 'user',
					content: '@test-user: Hello, world!',
				},
			],
		})
	})

	it('should ignore messages from non-monitored channels', async () => {
		const mockMessage = {
			author: {
				bot: false,
				username: 'test-user',
				toString: vi.fn().mockReturnValue('@test-user'),
			},
			channelId: 'nonexistent-test-channel',
			content: 'Hello, world!',
		}

		const messageHandler = (mockClient.on as any).mock.calls.find(
			(call: any) => call[0] === 'messageCreate',
		)[1]

		await messageHandler(mockMessage)

		expect(mockMessageHandler).not.toHaveBeenCalled()
	})
})
