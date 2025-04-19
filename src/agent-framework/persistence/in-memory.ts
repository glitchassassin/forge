import { type CoreMessage } from 'ai'
import { type Message, type ToolCallMessage } from '../types'
import { Persistence } from './index'

export class InMemoryPersistence extends Persistence {
	private messages: Message[] = []
	private conversations: Map<string, CoreMessage[]> = new Map()

	async getMessages(conversation?: string): Promise<Message[]> {
		return this.messages.filter(
			(message) =>
				!message.handled &&
				(!conversation || message.conversation === conversation),
		)
	}

	async getAllMessages(): Promise<Message[]> {
		return this.messages
	}

	async addMessage(message: Message): Promise<void> {
		this.messages.push(message)
	}

	async markAsHandled(id: Message['id']): Promise<void> {
		const message = this.messages.find((message) => message.id === id)
		if (message) {
			message.handled = true
		}
	}

	async getToolCall(
		toolCallId: string,
	): Promise<ToolCallMessage<string, unknown> | undefined> {
		return this.messages.find(
			(message): message is ToolCallMessage<string, unknown> =>
				message.type === 'tool-call' &&
				message.body.toolCall.toolCallId === toolCallId,
		)
	}

	async addCoreMessage(
		conversation: string,
		message: CoreMessage,
	): Promise<void> {
		const messages = this.conversations.get(conversation) || []
		messages.push(message)
		this.conversations.set(conversation, messages)
	}

	async getCoreMessages(
		conversation: string,
		limit?: number,
	): Promise<CoreMessage[]> {
		const messages = this.conversations.get(conversation) || []
		return limit ? messages.slice(-limit) : messages
	}
}
