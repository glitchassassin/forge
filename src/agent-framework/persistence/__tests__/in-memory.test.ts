import { beforeEach, describe, expect, it } from 'vitest'
import { type Message, type ToolCallMessage } from '../../types'
import { InMemoryPersistence } from '../in-memory'

describe('InMemoryPersistence', () => {
	let persistence: InMemoryPersistence

	beforeEach(() => {
		persistence = new InMemoryPersistence()
	})

	describe('getMessages', () => {
		it('should return only unhandled messages', async () => {
			const message1: Message = {
				type: 'agent',
				body: [],
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}
			const message2: Message = {
				type: 'agent',
				body: [],
				id: '2',
				conversation: 'test',
				created_at: new Date(),
				handled: true,
			}

			await persistence.addMessage(message1)
			await persistence.addMessage(message2)

			const messages = await persistence.getMessages()
			expect(messages).toHaveLength(1)
			expect(messages[0]?.id).toBe('1')
		})

		it('should return empty array when no messages', async () => {
			const messages = await persistence.getMessages()
			expect(messages).toHaveLength(0)
		})
	})

	describe('getAllMessages', () => {
		it('should return all messages regardless of handled status', async () => {
			const message1: Message = {
				type: 'agent',
				body: [],
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}
			const message2: Message = {
				type: 'agent',
				body: [],
				id: '2',
				conversation: 'test',
				created_at: new Date(),
				handled: true,
			}

			await persistence.addMessage(message1)
			await persistence.addMessage(message2)

			const messages = await persistence.getAllMessages()
			expect(messages).toHaveLength(2)
			expect(messages.map((m) => m.id)).toEqual(['1', '2'])
		})
	})

	describe('addMessage', () => {
		it('should add a message to the store', async () => {
			const message: Message = {
				type: 'agent',
				body: [],
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}

			await persistence.addMessage(message)
			const messages = await persistence.getAllMessages()
			expect(messages).toHaveLength(1)
			expect(messages[0]).toEqual(message)
		})
	})

	describe('markAsHandled', () => {
		it('should mark a message as handled', async () => {
			const message: Message = {
				type: 'agent',
				body: [],
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}

			await persistence.addMessage(message)
			await persistence.markAsHandled('1')

			const messages = await persistence.getAllMessages()
			expect(messages[0]?.handled).toBe(true)
		})

		it('should not throw when marking non-existent message', async () => {
			await expect(
				persistence.markAsHandled('non-existent'),
			).resolves.not.toThrow()
		})
	})

	describe('getToolCall', () => {
		it('should return tool call message by toolCallId', async () => {
			const toolCall: ToolCallMessage<string, unknown> = {
				type: 'tool-call',
				body: {
					toolCall: {
						toolName: 'test-tool',
						toolCallId: 'test-call-id',
						args: { test: 'data' },
					},
					messages: [],
				},
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}

			await persistence.addMessage(toolCall)
			const result = await persistence.getToolCall('test-call-id')
			expect(result).toEqual(toolCall)
		})

		it('should return undefined for non-existent tool call', async () => {
			const result = await persistence.getToolCall('non-existent')
			expect(result).toBeUndefined()
		})

		it('should return undefined for non-tool-call message', async () => {
			const message: Message = {
				type: 'agent',
				body: [],
				id: '1',
				conversation: 'test',
				created_at: new Date(),
				handled: false,
			}

			await persistence.addMessage(message)
			const result = await persistence.getToolCall('1')
			expect(result).toBeUndefined()
		})
	})
})
