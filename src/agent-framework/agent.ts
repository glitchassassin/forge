import { generateText, type ToolSet, type LanguageModelV1 } from 'ai'
import { logger } from '../core/logger'
import { type MessageQueue } from './queue'
import { type CreateToolCallMessage, type AgentMessage } from './types'

export class Agent {
	private model: LanguageModelV1
	public tools?: ToolSet
	private queue?: MessageQueue
	constructor({ model, tools }: { model: LanguageModelV1; tools?: ToolSet }) {
		this.model = model
		this.tools = tools
	}

	register(queue: MessageQueue) {
		this.queue = queue
		queue.on('agent', (message) => this.run(message))
	}

	async run(message: AgentMessage) {
		const response = await generateText({
			model: this.model,
			messages: message.body,
			tools: this.tools,
			toolChoice: 'required',
			maxSteps: 1,
		})

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
