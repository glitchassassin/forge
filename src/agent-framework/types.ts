import type { CoreMessage, ToolCall } from 'ai'

type BaseMessage = {
	id: string
	conversation: string
	created_at: Date
	handled: boolean
}

export type AgentMessage = {
	type: 'agent'
	body: CoreMessage[]
} & BaseMessage

export type ToolCallMessage<NAME extends string, ARGS> = {
	type: 'tool-call'
	body: {
		toolCall: ToolCall<NAME, ARGS>
		messages: CoreMessage[]
	}
} & BaseMessage

export type ApprovalResponseMessage<NAME extends string, ARGS> = {
	type: 'approval-response'
	body: {
		toolCall: ToolCall<NAME, ARGS>
		messages: CoreMessage[]
		approved: boolean
		reason?: string
	}
} & BaseMessage

export type Message =
	| AgentMessage
	| ToolCallMessage<string, any>
	| ApprovalResponseMessage<string, any>
