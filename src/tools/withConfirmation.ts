import { type Tool, type ToolExecutionOptions, type ToolSet } from 'ai'

/**
 * A function that wraps a set of MCP tools to require confirmation before execution.
 * @param tools The original set of MCP tools to wrap
 * @param confirm A function that returns a Promise<boolean> indicating whether the action should proceed
 * @returns A new set of tools that require confirmation before execution
 */
export const withConfirmation = <T extends ToolSet>(
	tools: T,
	confirm: (toolName: string, args: unknown[]) => Promise<boolean>,
): T => {
	const wrappedTools = {} as T

	// Iterate through each tool in the original set
	for (const [toolName, tool] of Object.entries(tools)) {
		const originalTool = tool as Tool & {
			execute: (
				args: unknown[],
				options: ToolExecutionOptions,
			) => Promise<unknown>
		}
		if (!originalTool.execute) {
			throw new Error(`Tool ${toolName} does not have an execute method`)
		}

		// Create a new tool that wraps the original tool
		wrappedTools[toolName as keyof T] = {
			...originalTool,
			execute: async (args: unknown[], options: ToolExecutionOptions) => {
				// Request confirmation before proceeding
				const shouldProceed = await confirm(toolName, args)

				if (!shouldProceed) {
					throw new Error('Action was not approved by the user')
				}

				// If confirmed, execute the original tool
				return originalTool.execute(args, options)
			},
		} as unknown as T[keyof T]
	}

	return wrappedTools
}
