import { ToolContent, type Tool, type ToolSet } from 'ai'
import { logger } from '../core/logger'
import { prisma } from '../db'

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

export async function processToolCall(
	toolCall: NonNullable<Awaited<ReturnType<typeof prisma.toolCall.findUnique>>>,
	toolset: ToolSet,
	conversationId: string,
) {
	try {
		const selectedTool = toolset[toolCall.toolName as keyof typeof toolset]
		if (!selectedTool?.execute) {
			throw new Error(`Tool ${toolCall.toolName} not found or not executable`)
		}

		// Check if the tool call has been approved
		if (toolCall.status !== 'approved') {
			throw new Error(`Tool call ${toolCall.id} has not been approved`)
		}

		logger.info('Executing tool call', {
			toolName: toolCall.toolName,
			toolCallId: toolCall.id,
			input: toolCall.toolInput,
		})

		// Update tool call status to started
		await prisma.toolCall.update({
			where: { id: toolCall.id },
			data: { startedAt: new Date(), status: 'started' },
		})

		// Execute the tool
		const result =
			(await selectedTool.execute(JSON.parse(toolCall.toolInput), {
				toolCallId: toolCall.id,
				messages: [],
			})) ?? null

		logger.info('Tool execution completed', {
			toolName: toolCall.toolName,
			toolCallId: toolCall.id,
			result,
		})

		// Create tool result message
		await prisma.message.create({
			data: {
				conversationId,
				role: 'tool',
				content: JSON.stringify([
					{
						type: 'tool-result',
						toolCallId: toolCall.id,
						toolName: toolCall.toolName,
						result,
					},
				] satisfies ToolContent),
				shouldTrigger: result !== null,
			},
		})

		// Update tool call status to finished
		await prisma.toolCall.update({
			where: { id: toolCall.id },
			data: {
				finishedAt: new Date(),
				status: 'finished',
				result: JSON.stringify(result),
			},
		})
	} catch (error) {
		// Create error message
		await prisma.message.create({
			data: {
				conversationId,
				role: 'tool',
				content: JSON.stringify([
					{
						type: 'tool-result',
						toolCallId: toolCall.id,
						toolName: toolCall.toolName,
						result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					},
				] satisfies ToolContent),
			},
		})

		// Update tool call status to finished with error
		await prisma.toolCall.update({
			where: { id: toolCall.id },
			data: {
				finishedAt: new Date(),
				status: 'finished',
				error: error instanceof Error ? error.message : 'Unknown error',
			},
		})
	}
}
