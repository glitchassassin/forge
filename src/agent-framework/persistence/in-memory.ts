import { Message, ToolCallMessage } from '../types'
import { Persistence } from './index'

export class InMemoryPersistence extends Persistence {
	private messages: Message[] = []

	async getMessages(): Promise<Message[]> {
		return this.messages.filter((message) => !message.handled)
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
}
