import { type Tool, type ToolExecutionOptions, type ToolSet } from 'ai'

/**
 * A function that wraps a set of MCP tools to log execution and output.
 * @param tools The original set of MCP tools to wrap
 * @param logger A function that handles logging (defaults to console.log)
 * @returns A new set of tools that log execution and output
 */
export const withLogging = <T extends ToolSet>(
	tools: T,
	logger: (message: string) => void = console.log,
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
				try {
					// Log the tool execution
					logger(
						`Executing tool: ${toolName} with args: ${JSON.stringify(args)}`,
					)
					// Execute the original tool
					const result = await originalTool.execute(args, options)
					// Log the result
					logger(
						`Tool ${toolName} completed with result: ${JSON.stringify(result)}`,
					)

					return result
				} catch (error) {
					logger(`Tool ${toolName} failed with error: ${error}`)
					throw error
				}
			},
		} as unknown as T[keyof T]
	}

	return wrappedTools
}
