import { type Tool, type ToolExecutionOptions, type ToolSet } from 'ai'
import { logger } from '../core/logger'

/**
 * A function that wraps a set of MCP tools to log execution and output.
 * @param tools The original set of MCP tools to wrap
 * @param logger A function that handles logging (defaults to Winston logger)
 * @returns A new set of tools that log execution and output
 */
export const withLogging = <T extends ToolSet>(
	tools: T,
	customLogger: (message: string) => void = (message) => logger.info(message),
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
					customLogger(
						`Executing tool: ${toolName} with args: ${JSON.stringify(args)}`,
					)
					// Execute the original tool
					const result = await originalTool.execute(args, options)
					// Log the result
					customLogger(
						`Tool ${toolName} completed with result: ${JSON.stringify(result)}`,
					)

					return result
				} catch (error) {
					logger.error(`Tool ${toolName} failed`, { error, args })
					throw error
				}
			},
		} as unknown as T[keyof T]
	}

	return wrappedTools
}
