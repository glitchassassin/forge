import { randomUUID } from 'node:crypto'
import { type Tool, type ToolSet } from 'ai'
import { logger } from '../core/logger'
import { type MessageQueue } from './queue'
import { resolveToolset, type ToolSetWithConversation } from './tools'
import { type ApprovalResponseMessage, type ToolCallMessage } from './types'

export class Runner {
	private queue?: MessageQueue
	private _tools: ToolSetWithConversation
	private requestApproval: (
		toolCall: ToolCallMessage<string, unknown>,
	) => Promise<'approved' | 'rejected' | 'pending'>
	constructor({
		tools,
		requestApproval,
	}: {
		tools: ToolSetWithConversation
		requestApproval: (
			toolCall: ToolCallMessage<string, unknown>,
		) => Promise<'approved' | 'rejected' | 'pending'>
	}) {
		this.requestApproval = requestApproval
		this._tools = tools
	}

	get tools() {
		return toolStubs(resolveToolset(this._tools, ''))
	}

	register(queue: MessageQueue) {
		this.queue = queue

		queue.on('approval-response', (message) =>
			this.handleApprovalResponse(message),
		)
		queue.on('tool-call', (message) => this.handleToolCall(message))
	}

	/**
	 * Request approval to run this specific tool call.
	 * The approver will send an approval response message.
	 */
	async handleToolCall(toolCall: ToolCallMessage<any, any>) {
		logger.debug('Handling tool call', { toolCall })
		const result = await this.requestApproval(toolCall)
		if (result !== 'pending') {
			await this.queue?.send({
				type: 'approval-response',
				body: {
					toolCall: toolCall.body.toolCall,
					messages: toolCall.body.messages,
					approved: result === 'approved',
				},
				id: randomUUID(),
				conversation: toolCall.conversation,
				created_at: new Date(),
				handled: false,
			})
		}
	}

	/**
	 * The tool call has been approved, so we can execute it
	 */
	async handleApprovalResponse(
		approvalResponse: ApprovalResponseMessage<string, unknown>,
	) {
		logger.debug('Handling approval response', { approvalResponse })
		// TODO: Add error handling
		const tools = this._tools
			? resolveToolset(this._tools, approvalResponse.conversation)
			: undefined
		const tool = tools?.[approvalResponse.body.toolCall.toolName]
		if (!tool) {
			throw new Error(
				`Tool ${approvalResponse.body.toolCall.toolName} not found`,
			)
		}
		const result = await tool.execute?.(approvalResponse.body.toolCall.args, {
			toolCallId: approvalResponse.id,
			messages: approvalResponse.body.messages,
		})

		if (result) {
			await this.queue?.send({
				type: 'agent',
				body: [
					{
						role: 'tool',
						content: [
							{
								toolCallId: approvalResponse.body.toolCall.toolCallId,
								toolName: approvalResponse.body.toolCall.toolName,
								type: 'tool-result',
								result,
							},
						],
					},
				],
				id: randomUUID(),
				conversation: approvalResponse.conversation,
				created_at: new Date(),
				handled: false,
			})
		}
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
