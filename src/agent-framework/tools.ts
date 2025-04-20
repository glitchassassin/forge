import { type ToolSet, type Tool } from 'ai'

export type ToolSetWithConversation = Record<
	string,
	Tool | ((conversation: string) => Tool)
>

export function withConversation<T>(fn: (conversation: string) => T) {
	return (conversation: string) => {
		return fn(conversation)
	}
}

export function resolveToolset(
	toolset: ToolSetWithConversation,
	conversation: string,
): ToolSet {
	return Object.fromEntries(
		Object.entries(toolset).map(([key, tool]) => [
			key,
			typeof tool === 'function' ? tool(conversation) : tool,
		]),
	)
}
