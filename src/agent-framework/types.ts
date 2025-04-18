import { type CoreMessage, type ToolCall } from 'ai'

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

export type CreateAgentMessage = Omit<
	AgentMessage,
	'id' | 'handled' | 'created_at'
>

export type ToolCallMessage<NAME extends string, ARGS> = {
	type: 'tool-call'
	body: {
		toolCall: ToolCall<NAME, ARGS>
		messages: CoreMessage[]
	}
} & BaseMessage

export type CreateToolCallMessage<NAME extends string, ARGS> = Omit<
	ToolCallMessage<NAME, ARGS>,
	'id' | 'handled' | 'created_at'
>

export type ApprovalResponseMessage<NAME extends string, ARGS> = {
	type: 'approval-response'
	body: {
		toolCall: ToolCall<NAME, ARGS>
		messages: CoreMessage[]
		approved: boolean
		reason?: string
	}
} & BaseMessage

export type CreateApprovalResponseMessage<NAME extends string, ARGS> = Omit<
	ApprovalResponseMessage<NAME, ARGS>,
	'id' | 'handled' | 'created_at'
>

export type Message =
	| AgentMessage
	| ToolCallMessage<string, any>
	| ApprovalResponseMessage<string, any>

export type CreateMessage =
	| CreateAgentMessage
	| CreateToolCallMessage<string, any>
	| CreateApprovalResponseMessage<string, any>
