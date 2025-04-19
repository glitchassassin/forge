import { type Tool, type ToolSet } from 'ai'
import { type MessageQueue } from './queue'
import { resolveToolset, type ToolSetWithConversation } from './tools'
import { type ApprovalResponseMessage, type ToolCallMessage } from './types'

export class Runner {
	private queue?: MessageQueue
	private _tools: ToolSetWithConversation
	private approvedTools: Set<string>
	private requestApproval: (
		toolCall: ToolCallMessage<string, unknown>,
	) => Promise<'approved' | 'rejected' | 'pending'>
	constructor({
		tools,
		approvedTools,
		requestApproval,
	}: {
		tools: ToolSetWithConversation
		approvedTools?: string[]
		requestApproval: (
			toolCall: ToolCallMessage<string, unknown>,
		) => Promise<'approved' | 'rejected' | 'pending'>
	}) {
		this.requestApproval = requestApproval
		this._tools = tools
		this.approvedTools = new Set(approvedTools)
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
		if (this.approvedTools.has(toolCall.body.toolCall.toolName)) {
			await this.queue?.send({
				type: 'approval-response',
				body: {
					toolCall: toolCall.body.toolCall,
					messages: toolCall.body.messages,
					approved: true,
				},
				conversation: toolCall.conversation,
			})
			return
		}
		const result = await this.requestApproval(toolCall)
		if (result !== 'pending') {
			await this.queue?.send({
				type: 'approval-response',
				body: {
					toolCall: toolCall.body.toolCall,
					messages: toolCall.body.messages,
					approved: result === 'approved',
				},
				conversation: toolCall.conversation,
			})
		}
	}

	/**
	 * The tool call has been approved, so we can execute it
	 */
	async handleApprovalResponse(
		approvalResponse: ApprovalResponseMessage<string, unknown>,
	) {
		if (!approvalResponse.body.approved) {
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
								isError: true,
								result: 'Tool call rejected by the user',
							},
						],
					},
				],
				conversation: approvalResponse.conversation,
			})
			return
		}
		try {
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
								result: result ?? '',
							},
						],
					},
				],
				conversation: approvalResponse.conversation,
			})
		} catch (error) {
			console.error('[handleApprovalResponse]', error)
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
								isError: true,
								result:
									error instanceof Error
										? error.message
										: 'Unknown error occurred',
							},
						],
					},
				],
				conversation: approvalResponse.conversation,
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
