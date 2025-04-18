import { randomUUID } from 'node:crypto'
import { Approver } from '.'
import { ApprovalResponseMessage, ToolCallMessage } from '../types'

/**
 * Always approve all tool calls.
 */
export class AlwaysApprove implements Approver {
	private handler: (
		approvalResponse: ApprovalResponseMessage<string, unknown>,
	) => void = () => {}

	onApprovalResponse(
		handler: (
			approvalResponse: ApprovalResponseMessage<string, unknown>,
		) => void,
	): void {
		this.handler = handler
	}
	async requestApproval(
		toolCall: ToolCallMessage<string, unknown>,
	): Promise<void> {
		this.handler({
			type: 'approval-response',
			body: {
				toolCall: toolCall.body.toolCall,
				messages: toolCall.body.messages,
				approved: true,
			},
			id: randomUUID(),
			conversation: toolCall.conversation,
			created_at: new Date(),
			handled: false,
		})
	}
}
