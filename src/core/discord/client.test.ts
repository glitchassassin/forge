import { Client, REST } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Database } from '../database'
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
    applicationCommands: (clientId: string) => `/applications/${clientId}/commands`,
  },
}))

describe('DiscordClient', () => {
  let client: DiscordClient
  let mockClient: Client
  let mockRest: REST
  let db: Database
  let messageHandler: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Create a new database for each test
    db = new Database()
    client = new DiscordClient('test-token', db)
    mockClient = (Client as any).mock.results[(Client as any).mock.results.length - 1].value
    mockRest = (REST as any).mock.results[(REST as any).mock.results.length - 1].value
    messageHandler = vi.fn()
    client.onMessage(messageHandler)
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
    expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function))
    expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function))
  })

  it('should register commands on start', async () => {
    await client.start()
    expect(mockClient.login).toHaveBeenCalledWith('test-token')
    expect(mockRest.put).toHaveBeenCalledWith(
      '/applications/test-client-id/commands',
      { body: expect.arrayContaining([expect.objectContaining({ name: 'monitor' })]) }
    )
  })

  it('should handle monitor command', async () => {
    const mockInteraction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      commandName: 'monitor',
      channelId: 'test-channel',
      reply: vi.fn(),
    }

    // Get the interaction handler
    const interactionHandler = (mockClient.on as any).mock.calls.find(
      (call: any) => call[0] === 'interactionCreate'
    )[1]

    await interactionHandler(mockInteraction)

    // Verify the channel was added to the database
    expect(db.getChannels()).toContain('test-channel')
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: 'Now monitoring this channel for messages.',
      ephemeral: true,
    })
  })

  it('should call message handler with event', async () => {
    // First, monitor the channel
    const mockInteraction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      commandName: 'monitor',
      channelId: 'test-channel',
      reply: vi.fn(),
    }

    const interactionHandler = (mockClient.on as any).mock.calls.find(
      (call: any) => call[0] === 'interactionCreate'
    )[1]

    await interactionHandler(mockInteraction)

    // Now send a message to the monitored channel
    const mockMessage = {
      author: { bot: false, username: 'test-user' },
      channelId: 'test-channel',
      content: 'Hello, world!',
      channel: {
        messages: {
          fetch: vi.fn().mockResolvedValue(new Map()),
        },
      },
    }

    const internalMessageHandler = (mockClient.on as any).mock.calls.find(
      (call: any) => call[0] === 'messageCreate'
    )[1]

    await internalMessageHandler(mockMessage)

    // Verify the event was created and passed to our handler
    expect(messageHandler).toHaveBeenCalledWith({
      type: 'discord',
      channel: 'test-channel',
      messages: [{
        role: 'user',
        content: 'Hello, world!',
        name: 'test-user',
      }],
    })
  })

  it('should ignore messages from non-monitored channels', async () => {
    const mockMessage = {
      author: { bot: false, username: 'test-user' },
      channelId: 'test-channel',
      content: 'Hello, world!',
      channel: {
        messages: {
          fetch: vi.fn().mockResolvedValue(new Map()),
        },
      },
    }

    const internalMessageHandler = (mockClient.on as any).mock.calls.find(
      (call: any) => call[0] === 'messageCreate'
    )[1]

    await internalMessageHandler(mockMessage)

    expect(messageHandler).not.toHaveBeenCalled()
  })
}) 