import { randomUUID } from 'node:crypto'
import { logger } from '../core/logger'
import { type Agent } from './agent'
import { type MessageQueue } from './queue'
import { resolveToolset } from './tools'
import {
	type AgentMessage,
	type ApprovalResponseMessage,
	type ToolCallMessage,
} from './types'

export class Runner {
	private queue?: MessageQueue
	private agent: Agent
	private requestApproval: (
		toolCall: ToolCallMessage<string, unknown>,
	) => Promise<'approved' | 'rejected' | 'pending'>
	constructor({
		agent,
		requestApproval,
	}: {
		agent: Agent
		requestApproval: (
			toolCall: ToolCallMessage<string, unknown>,
		) => Promise<'approved' | 'rejected' | 'pending'>
	}) {
		this.agent = agent
		this.requestApproval = requestApproval
	}

	register(queue: MessageQueue) {
		this.queue = queue

		queue.on('agent', (message) => this.handleAgentMessage(message))
		queue.on('approval-response', (message) =>
			this.handleApprovalResponse(message),
		)
		queue.on('tool-call', (message) => this.handleToolCall(message))
	}

	async handleAgentMessage(message: AgentMessage) {
		logger.debug('Handling agent message', { message })
		const toolCalls = await this.agent.run(message)

		for (const toolCall of toolCalls) {
			await this.queue?.send(toolCall)
		}
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
		const tools = this.agent.tools
			? resolveToolset(this.agent.tools, approvalResponse.conversation)
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
