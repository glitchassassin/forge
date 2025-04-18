import { describe, expect, it, vi } from 'vitest'
import { ToolCallMessage } from '../../types'
import { AlwaysApprove } from '../always-approve'

describe('AlwaysApprove', () => {
	it('should always approve tool calls', async () => {
		const handler = vi.fn()
		const approver = new AlwaysApprove()
		approver.onApprovalResponse(handler)

		const mockToolCall: ToolCallMessage<string, unknown> = {
			type: 'tool-call',
			body: {
				toolCall: {
					toolName: 'test-tool',
					toolCallId: 'test-call-id',
					args: { test: 'data' },
				},
				messages: [],
			},
			id: 'test-id',
			conversation: 'test-conversation',
			created_at: new Date(),
			handled: false,
		}

		await approver.requestApproval(mockToolCall)

		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'approval-response',
				body: {
					toolCall: mockToolCall.body.toolCall,
					messages: mockToolCall.body.messages,
					approved: true,
				},
				conversation: mockToolCall.conversation,
				handled: false,
			}),
		)
	})
})
