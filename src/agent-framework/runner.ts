import { randomUUID } from 'node:crypto'
import { Agent } from './agent'
import { Approver } from './approver'
import { type MessageQueue } from './queue'
import { AgentMessage, ApprovalResponseMessage, ToolCallMessage } from './types'

export class Runner {
	private queue?: MessageQueue
	private agent: Agent
	private approver: Approver
	constructor({ agent, approver }: { agent: Agent; approver: Approver }) {
		this.agent = agent
		this.approver = approver
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
		const toolCalls = await this.agent.run(message)

		for (const toolCall of toolCalls) {
			this.queue?.send(toolCall)
		}
	}

	/**
	 * Request approval to run this specific tool call.
	 * The approver will send an approval response message.
	 */
	async handleToolCall(toolCall: ToolCallMessage<any, any>) {
		await this.approver.requestApproval(toolCall)
	}

	/**
	 * The tool call has been approved, so we can execute it
	 */
	async handleApprovalResponse(
		approvalResponse: ApprovalResponseMessage<string, unknown>,
	) {
		// TODO: Add error handling
		this.queue?.send(approvalResponse)
		const tool = this.agent.tools?.[approvalResponse.body.toolCall.toolName]
		if (!tool) {
			throw new Error(
				`Tool ${approvalResponse.body.toolCall.toolName} not found`,
			)
		}
		const result = await tool.execute?.(approvalResponse.body.toolCall.args, {
			toolCallId: approvalResponse.id,
			messages: approvalResponse.body.messages,
		})
		this.queue?.send({
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
