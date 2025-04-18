import { generateText, LanguageModelV1, Tool, ToolSet } from 'ai'
import { randomUUID } from 'node:crypto'
import { AgentMessage, ToolCallMessage } from './types'

export class Agent {
	private model: LanguageModelV1
	public tools?: ToolSet
	constructor({ model, tools }: { model: LanguageModelV1; tools?: ToolSet }) {
		this.model = model
		this.tools = tools
	}

	async run(message: AgentMessage) {
		const response = await generateText({
			model: this.model,
			messages: message.body,
			tools: this.tools ? toolStubs(this.tools) : undefined,
			toolChoice: 'required',
			maxSteps: 1,
		})

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
