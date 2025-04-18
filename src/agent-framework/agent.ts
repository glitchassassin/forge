import {
	generateText,
	type ToolSet,
	type LanguageModelV1,
	type CoreMessage,
} from 'ai'
import { logger } from '../core/logger'
import { type MessageQueue } from './queue'
import { type CreateToolCallMessage, type AgentMessage } from './types'

export class Agent {
	private model: LanguageModelV1
	public tools?: ToolSet
	private queue?: MessageQueue
	private messages: CoreMessage[] = []
	constructor({ model, tools }: { model: LanguageModelV1; tools?: ToolSet }) {
		this.model = model
		this.tools = tools
	}

	register(queue: MessageQueue) {
		this.queue = queue
		queue.on('agent', (message) => this.run(message))
	}

	async run(message: AgentMessage) {
		this.messages.push(...message.body)

		// don't send if we only have empty tool result messages
		if (
			message.body.every(
				(m) => m.role === 'tool' && !m.content.every((c) => c.result),
			)
		) {
			return
		}

		const response = await generateText({
			model: this.model,
			messages: this.messages,
			tools: this.tools,
			toolChoice: 'required',
			maxSteps: 1,
		})

		this.messages.push(...response.response.messages)

		logger.debug('Agent response', { response })

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
	}
}
