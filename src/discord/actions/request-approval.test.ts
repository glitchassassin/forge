import { TextChannel } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../db'
import { discordClient } from '../client'
import { requestApproval } from './request-approval'

// Mock Discord client
vi.mock('../client', () => {
	const mockChannel = {
		isTextBased: () => true,
		type: 0, // GuildText
		send: vi.fn(),
	} as unknown as TextChannel

	let interactionHandler: (interaction: any) => void = vi.fn()
	return {
		discordClient: {
			client: {
				channels: {
					fetch: vi
						.fn()
						.mockImplementation((id: string) => Promise.resolve(mockChannel)),
				},
				on: vi.fn().mockImplementation((event, handler) => {
					if (event === 'interactionCreate') {
						interactionHandler = handler
					}
					return discordClient.client
				}),
			},
			__interactionHandler: () => interactionHandler,
		},
	}
})

describe('Request Approval', () => {
	const mockInteraction = {
		isButton: () => true,
		customId: '',
		update: vi.fn(),
		followUp: vi.fn(),
	}

	beforeEach(async () => {
		// Reset mocks
		vi.clearAllMocks()

		await prisma.mcpServer.create({
			data: {
				id: 'test-server',
				url: 'https://test.com',
			},
		})
	})

	it('should send approval request to channel', async () => {
		const channelId = 'test-channel'
		const content = 'Test approval request'
		const toolCallId = 'test-tool-call'

		await requestApproval(channelId, content, toolCallId)

		expect(discordClient.client.channels.fetch).toHaveBeenCalledWith(channelId)
		const mockChannel = (await discordClient.client.channels.fetch(
			channelId,
		)) as TextChannel
		expect(mockChannel.send).toHaveBeenCalledWith({
			content,
			components: expect.arrayContaining([
				expect.objectContaining({
					components: expect.arrayContaining([
						expect.objectContaining({
							data: expect.objectContaining({
								label: 'Approve',
							}),
						}),
						expect.objectContaining({
							data: expect.objectContaining({
								label: 'Always Approve',
							}),
						}),
						expect.objectContaining({
							data: expect.objectContaining({
								label: 'Reject',
							}),
						}),
					]),
				}),
			]),
		})
	})

	it('should handle approval action', async () => {
		// Create test data
		const conversation = await prisma.conversation.create({
			data: { id: 'test-conversation' },
		})
		const message = await prisma.message.create({
			data: {
				id: 'test-message',
				conversationId: conversation.id,
				role: 'assistant',
				content: 'test',
			},
		})
		const toolCall = await prisma.toolCall.create({
			data: {
				id: 'test-tool-call',
				messageId: message.id,
				toolName: 'test-tool',
				toolInput: '{}',
				status: 'waiting-for-approval',
			},
		})

		// Simulate approve button click
		const interaction = {
			...mockInteraction,
			customId: `tool-approve|${toolCall.id}`,
		}
		await (discordClient as any).__interactionHandler()(interaction)

		// Verify tool call was approved
		const updatedToolCall = await prisma.toolCall.findUnique({
			where: { id: toolCall.id },
		})
		expect(updatedToolCall?.status).toBe('approved')
		expect(updatedToolCall?.approvedAt).toBeDefined()
	})

	it('should handle always approve action', async () => {
		// Create test data
		const conversation = await prisma.conversation.create({
			data: { id: 'test-conversation' },
		})
		const message = await prisma.message.create({
			data: {
				id: 'test-message',
				conversationId: conversation.id,
				role: 'assistant',
				content: 'test',
			},
		})
		const tool = await prisma.tool.create({
			data: {
				name: 'test-tool',
				mcpServerId: 'test-server',
				requiresApproval: true,
			},
		})
		const toolCall = await prisma.toolCall.create({
			data: {
				id: 'test-tool-call',
				messageId: message.id,
				toolName: tool.name,
				toolInput: '{}',
				status: 'waiting-for-approval',
			},
		})

		// Simulate always approve button click
		const interaction = {
			...mockInteraction,
			customId: `tool-always-approve|${toolCall.id}`,
		}
		await (discordClient as any).__interactionHandler()(interaction)

		// Verify tool call was approved
		const updatedToolCall = await prisma.toolCall.findUnique({
			where: { id: toolCall.id },
		})
		expect(updatedToolCall?.status).toBe('approved')
		expect(updatedToolCall?.approvedAt).toBeDefined()

		// Verify tool was updated to not require approval
		const updatedTool = await prisma.tool.findUnique({
			where: { id: tool.id },
		})
		expect(updatedTool?.requiresApproval).toBe(false)
	})

	it('should handle reject action', async () => {
		// Create test data
		const conversation = await prisma.conversation.create({
			data: { id: 'test-conversation' },
		})
		const message = await prisma.message.create({
			data: {
				id: 'test-message',
				conversationId: conversation.id,
				role: 'assistant',
				content: 'test',
			},
		})
		const toolCall = await prisma.toolCall.create({
			data: {
				id: 'test-tool-call',
				messageId: message.id,
				toolName: 'test-tool',
				toolInput: '{}',
				status: 'waiting-for-approval',
			},
		})

		// Simulate reject button click
		const interaction = {
			...mockInteraction,
			customId: `tool-reject|${toolCall.id}`,
		}
		await (discordClient as any).__interactionHandler()(interaction)

		// Verify tool call was rejected
		const updatedToolCall = await prisma.toolCall.findUnique({
			where: { id: toolCall.id },
		})
		expect(updatedToolCall?.status).toBe('finished')
		expect(updatedToolCall?.error).toBe('Tool call was rejected by the user')
		expect(updatedToolCall?.finishedAt).toBeDefined()

		// Verify rejection message was created
		const rejectionMessage = await prisma.message.findFirst({
			where: {
				conversationId: conversation.id,
				role: 'tool',
			},
		})
		expect(rejectionMessage).toBeDefined()
		expect(rejectionMessage?.content).toContain(
			'Tool call was rejected by the user',
		)
	})
})
