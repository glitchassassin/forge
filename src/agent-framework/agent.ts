import {
	generateText,
	type ToolSet,
	type CoreMessage,
	APICallError,
	AISDKError,
	type ToolCall,
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

	register(queue: MessageQueue) {
		this.queue = queue
		queue.on('agent', (message) => this.run(message))
	}

	async storeMessage(conversation: string, message: CoreMessage) {
		const primaryKey = ulid()
		await this.repository.create({
			primaryKey,
			secondaryKey: conversation,
			item: message,
		})
		return primaryKey
	}

	async storePendingToolCall(
		conversation: string,
		toolCall: ToolCall<string, any>,
	) {
		const primaryKey = ulid()
		await this.repository.create({
			primaryKey,
			secondaryKey: conversation,
			item: {
				role: 'assistant',
				content: `[${toolCall.toolCallId}] I am waiting for approval to call the tool "${toolCall.toolName}" with arguments: ${JSON.stringify(toolCall.args, null, 2)}`,
			},
		})
		return primaryKey
	}

	async getContext(conversation: string) {
		const conversationMessages = await this.repository.read({
			secondaryKey: conversation,
			limit: 100,
		})
		return conversationMessages.map((m) => m.item)
	}

	async run(message: AgentMessage) {
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
			// Get the last 100 messages from the repository
			const messages = await this.getContext(message.conversation)

			const response = await generateText({
				...this.generateTextArgs,
				messages,
				tools: this.tools,
				toolChoice: 'required',
				maxSteps: 1,
			})

			// Persist response messages
			for (const msg of response.response.messages) {
				if (msg.role === 'tool') continue
				await this.storeMessage(message.conversation, msg)
			}

			for (const toolCall of response.toolCalls) {
				await this.storePendingToolCall(message.conversation, toolCall)

				await this.queue?.send({
					type: 'tool-call',
					body: {
						toolCall,
						messages: response.response.messages,
					},
					conversation: message.conversation,
				} satisfies CreateToolCallMessage<any, any>)
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
