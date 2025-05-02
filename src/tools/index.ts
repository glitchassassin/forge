import { type Tool, type ToolSet } from 'ai'

/**
 * Returns a stub of a tool that can be used to create a ToolCall without executing it
 */
export function toolStub(tool: Tool) {
	const { execute, ...rest } = tool
	return rest
}

export function toolStubs(tools: ToolSet) {
	return Object.fromEntries(
		Object.entries(tools).map(([key, tool]) => [key, toolStub(tool)]),
	)
}
