import { ApprovalResponseMessage, ToolCallMessage } from '../types'

export type Approver = {
	requestApproval(toolCall: ToolCallMessage<string, unknown>): Promise<void>

	onApprovalResponse(
		handler: (
			approvalResponse: ApprovalResponseMessage<string, unknown>,
		) => void,
	): void
}
