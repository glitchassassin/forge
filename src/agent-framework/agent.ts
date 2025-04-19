import {
	generateText,
	type ToolSet,
	type LanguageModelV1,
	type CoreMessage,
	APICallError,
	AISDKError,
} from 'ai'
import { type Persistence } from './persistence'
import { type MessageQueue } from './queue'
import { type CreateToolCallMessage, type AgentMessage } from './types'

export class Agent {
	private model: LanguageModelV1
	public tools?: ToolSet
	private queue?: MessageQueue
	private messages: Map<string, CoreMessage[]> = new Map()
	private persistence: Persistence

	constructor({
		model,
		tools,
		persistence,
	}: {
		model: LanguageModelV1
		tools?: ToolSet
		persistence: Persistence
	}) {
		this.model = model
		this.tools = tools
		this.persistence = persistence
	}

	async initialize(conversation: string) {
		if (this.messages.has(conversation)) {
			return
		}

		// Load the last 100 messages from persistence
		const messages = await this.persistence.getCoreMessages(conversation, 100)
		this.messages.set(conversation, messages)
	}

	register(queue: MessageQueue) {
		this.queue = queue
		queue.on('agent', (message) => this.run(message))
	}

	async storeMessage(conversation: string, message: CoreMessage) {
		const messages = this.messages.get(conversation) || []
		messages.push(message)
		this.messages.set(conversation, messages)
		await this.persistence.addCoreMessage(conversation, message)
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
			console.log('[run]', conversationMessages)
			const response = await generateText({
				model: this.model,
				messages: conversationMessages,
				tools: this.tools,
				toolChoice: 'required',
				maxSteps: 1,
				system: `
You are Forge, an advanced AI agent.

Your personality is precise, concise, and to the point. Don't worry about formalities.
Critique my ideas freely and without sycophancy. I value honesty over politeness.
Don't use emojis unless you are asked to.

The current time is ${new Date().toLocaleString()}.`,
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
