import { randomUUID } from 'node:crypto'
import { generateText, type ToolSet, type LanguageModelV1, type Tool } from 'ai'
import { logger } from '../core/logger'
import { resolveToolset, type ToolSetWithConversation } from './tools'
import { type AgentMessage, type ToolCallMessage } from './types'

export class Agent {
	private model: LanguageModelV1
	public tools?: ToolSetWithConversation
	constructor({
		model,
		tools,
	}: {
		model: LanguageModelV1
		tools?: ToolSetWithConversation
	}) {
		this.model = model
		this.tools = tools
	}

	async run(message: AgentMessage) {
		const response = await generateText({
			model: this.model,
			messages: message.body,
			tools: this.tools
				? toolStubs(resolveToolset(this.tools, message.conversation))
				: undefined,
			toolChoice: 'required',
			maxSteps: 1,
		})

		logger.debug('Agent response', { response })

		return response.toolCalls.map(
			(toolCall) =>
				({
					type: 'tool-call',
					body: {
						toolCall,
						messages: message.body,
					},
					id: randomUUID(),
					conversation: message.conversation,
					created_at: new Date(),
					handled: false,
				}) satisfies ToolCallMessage<any, any>,
		)
	}
}

/**
 * Returns a stub of a tool that can be used to create a ToolCall without executing it
 */
function toolStub(tool: Tool) {
	const { execute, ...rest } = tool
	return rest
}

function toolStubs(tools: ToolSet) {
	return Object.fromEntries(
		Object.entries(tools).map(([key, tool]) => [key, toolStub(tool)]),
	)
}
