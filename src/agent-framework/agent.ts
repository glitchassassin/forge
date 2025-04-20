import {
	generateText,
	type ToolSet,
	type CoreMessage,
	APICallError,
	AISDKError,
} from 'ai'
import { ulid } from 'ulid'
import { type MessageQueue } from './queue'
import { type Repository } from './repository'
import { InMemoryRepository } from './repository/in-memory'
import { type CreateToolCallMessage, type AgentMessage } from './types'

export class Agent {
	public tools?: ToolSet
	public generateTextArgs: Omit<
		Parameters<typeof generateText>[0],
		'tools' | 'messages' | 'toolChoice' | 'maxSteps'
	>
	private queue?: MessageQueue
	private messages: Map<string, CoreMessage[]> = new Map()
	private repository: Repository<CoreMessage>

	constructor({
		tools,
		repository = new InMemoryRepository<CoreMessage>(),
		...generateTextArgs
	}: Parameters<typeof generateText>[0] & {
		repository: Repository<CoreMessage>
	}) {
		this.tools = tools
		this.repository = repository
		this.generateTextArgs = generateTextArgs
	}

	async initialize(conversation: string) {
		if (this.messages.has(conversation)) {
			return
		}

		// Load the last 100 messages from persistence
		const messages = await this.repository.read({
			secondaryKey: conversation,
			limit: 100,
		})
		this.messages.set(
			conversation,
			messages.map((m) => m.item),
		)
	}

	register(queue: MessageQueue) {
		this.queue = queue
		queue.on('agent', (message) => this.run(message))
	}

	async storeMessage(conversation: string, message: CoreMessage) {
		const messages = this.messages.get(conversation) || []
		messages.push(message)
		this.messages.set(conversation, messages)
		await this.repository.create({
			primaryKey: ulid(),
			secondaryKey: conversation,
			item: message,
		})
	}

	async run(message: AgentMessage) {
		// Initialize conversation if needed
		await this.initialize(message.conversation)

		// Persist new messages
		for (const msg of message.body) {
			await this.storeMessage(message.conversation, msg)
		}

		// don't send if we only have empty tool result messages
		if (
			message.body.every(
				(m) => m.role === 'tool' && !m.content.every((c) => c.result),
			)
		) {
			return
		}

		try {
			const conversationMessages = this.messages.get(message.conversation) || []
			const response = await generateText({
				...this.generateTextArgs,
				messages: conversationMessages,
				tools: this.tools,
				toolChoice: 'required',
				maxSteps: 1,
			})

			// Persist response messages
			for (const msg of response.response.messages) {
				await this.storeMessage(message.conversation, msg)
			}

			for (const toolCall of response.toolCalls.map(
				(toolCall) =>
					({
						type: 'tool-call',
						body: {
							toolCall,
							messages: response.response.messages,
						},
						conversation: message.conversation,
					}) satisfies CreateToolCallMessage<any, any>,
			)) {
				await this.queue?.send(toolCall)
			}
		} catch (error) {
			// console.error(error)
			if (APICallError.isInstance(error)) {
				await this.queue?.send({
					type: 'error',
					body: JSON.stringify(
						{
							name: error.name,
							message: error.message,
							cause: error.cause,
						},
						null,
						2,
					),
					conversation: message.conversation,
				})
			} else if (AISDKError.isInstance(error)) {
				await this.queue?.send({
					type: 'error',
					body: JSON.stringify(
						{
							name: error.name,
							message: error.message,
							cause: error.cause,
							stack: error.stack,
						},
						null,
						2,
					),
					conversation: message.conversation,
				})
			}
		}
	}
}
