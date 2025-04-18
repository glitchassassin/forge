import { type Message, type ToolCallMessage } from '../types'

export abstract class Persistence {
	abstract getMessages(): Promise<Message[]>
	abstract addMessage(message: Message): Promise<void>
	abstract markAsHandled(id: Message['id']): Promise<void>
	abstract getToolCall(
		id: string,
	): Promise<ToolCallMessage<string, unknown> | undefined>
}
