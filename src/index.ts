import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
	APICallError,
	generateText,
	type CoreMessage,
	type CoreToolMessage,
	type ToolContent,
	type ToolSet,
} from 'ai'
import 'dotenv/config'
import { logger } from './core/logger'
import { prisma } from './db'
import { ensureConversation } from './db/ensureConversation'
import { setupMCPServersChannel } from './discord/actions/setup-mcp-servers-channel'
import { setupMCPToolsChannel } from './discord/actions/setup-mcp-tools-channel'
import { discordClient } from './discord/client'
import { toolStubs } from './tools'
import { discord } from './tools/discord'
import { mcp } from './tools/mcp'
import { runScheduledMessages, scheduler } from './tools/scheduler'
import { handleError } from './utils/error-handler'
import { createWebhookServer } from './webhook/server'

// Event Sources

await discordClient.start()
await Promise.all([
	setupMCPServersChannel().catch((error) => {
		logger.error('Failed to set up MCP servers channel', { error })
	}),
	setupMCPToolsChannel().catch((error) => {
		logger.error('Failed to set up MCP tools channel', { error })
	}),
])

createWebhookServer(async (conversationId, content) => {
	await ensureConversation(conversationId)
	await prisma.message.create({
		data: {
			conversationId,
			role: 'user',
			content,
		},
	})
})

// Message Loop

export const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
})

async function processConversation(
	conversation: Exclude<
		Awaited<ReturnType<typeof prisma.conversation.findUnique>>,
		null
	>,
) {
	// Handle tool calls
	const pendingToolCalls = await prisma.toolCall.findMany({
		where: {
			message: {
				conversationId: conversation.id,
			},
			status: 'approved',
			finishedAt: null,
		},
	})

	// Check for new messages
	const hasNewMessages =
		!conversation.lastProcessedMessageTimestamp ||
		(await prisma.message.findFirst({
			where: {
				conversationId: conversation.id,
				createdAt: {
					gt: conversation.lastProcessedMessageTimestamp,
				},
				shouldTrigger: true,
			},
		}))

	if (!hasNewMessages && pendingToolCalls.length === 0) {
		return // No new messages or tool calls to process
	}

	// set up tools
	const toolset: ToolSet = {
		...discord({
			conversationId: conversation.id,
		}),
		...scheduler({ conversationId: conversation.id }),
		...(await mcp()),
	}

	// Execute approved tool calls in parallel
	await Promise.all(
		pendingToolCalls.map(async (toolCall) => {
			try {
				const selectedTool = toolset[toolCall.toolName as keyof typeof toolset]
				if (!selectedTool?.execute) {
					throw new Error(
						`Tool ${toolCall.toolName} not found or not executable`,
					)
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
						conversationId: conversation.id,
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
						conversationId: conversation.id,
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
		}),
	)

	if (!hasNewMessages) {
		return // No new messages to process
	}

	// Get context for inference
	const messages = await prisma.message.findMany({
		where: {
			conversationId: conversation.id,
		},
		include: {
			toolCalls: true,
		},
		orderBy: { createdAt: 'asc' },
		take: 100,
	})
	if (messages.length === 0) {
		return // No messages to process
	}

	try {
		const context: CoreMessage[] = messages.flatMap((msg) => {
			if (msg.role === 'tool') {
				return [
					{
						role: msg.role,
						content: JSON.parse(msg.content) as ToolContent,
					} satisfies CoreToolMessage,
				]
			}
			if (msg.toolCalls.length > 0) {
				// add "pending" tool results for each incomplete tool call
				return [
					{
						role: msg.role as 'user' | 'assistant' | 'system',
						content: JSON.parse(msg.content),
					} satisfies CoreMessage,
					...msg.toolCalls
						.filter((t) => t.status !== 'finished')
						.map(
							(toolCall): CoreToolMessage => ({
								role: 'tool',
								content: [
									{
										type: 'tool-result',
										toolCallId: toolCall.id,
										toolName: toolCall.toolName,
										result: `<tool_call_status>${toolCall.status}</tool_call_status>`,
										isError: false,
									},
								],
							}),
						),
				]
			}
			return [
				{
					role: msg.role as 'user' | 'assistant' | 'system',
					content: msg.content,
				} satisfies CoreMessage,
			]
		})

		// Generate response
		const result = await generateText({
			model: openrouter('openai/gpt-4.1-mini'),
			tools: toolStubs(toolset),
			messages: context,
			system: `You are Forge, an advanced AI agent.

Your personality is precise, concise, and to the point. Don't worry about formalities.
Critique my ideas freely and without sycophancy. I value honesty over politeness.

The current time is ${new Date().toLocaleString()}.

You are on a Discord server, so you can use the user's snowflake to identify them
for tool calls or tag them in messages. For example, "<@123456>". Only tag the user
for things like scheduled events.`,
		})

		// Store assistant messages and tool calls
		let madeToolCall = false
		for (const message of result.response.messages) {
			const storedMessage = await prisma.message.create({
				data: {
					conversationId: conversation.id,
					role: message.role,
					content:
						typeof message.content === 'string'
							? message.content
							: JSON.stringify(message.content),
					shouldTrigger: false,
				},
			})

			// If this is an assistant message with tool calls, store them
			if (message.role === 'assistant' && Array.isArray(message.content)) {
				const toolCalls = message.content.filter(
					(part) => part.type === 'tool-call',
				)
				for (const toolCall of toolCalls) {
					if (toolCall.type === 'tool-call') {
						await prisma.toolCall.create({
							data: {
								id: toolCall.toolCallId,
								messageId: storedMessage.id,
								toolName: toolCall.toolName,
								toolInput: JSON.stringify(toolCall.args),
								status: 'approved', // Auto-approve for now
							},
						})
						madeToolCall = true
					}
				}
			}
		}
		if (!madeToolCall) {
			await prisma.message.create({
				data: {
					conversationId: conversation.id,
					role: 'user',
					content:
						'You failed to make a tool call. All communication with the user should be via the Discord tool.',
				},
			})
		}
	} catch (error) {
		await handleError(error, 'processConversation', discordClient)

		if (APICallError.isInstance(error)) {
			console.error(error.cause)
		}
	}

	// Update conversation's last processed message ID
	await prisma.conversation.update({
		where: { id: conversation.id },
		data: {
			lastProcessedMessageTimestamp: messages[messages.length - 1]!.createdAt,
		},
	})
}

async function main() {
	await runScheduledMessages()
	const conversations = await prisma.conversation.findMany()
	await Promise.all(
		conversations.map(async (conversation) => {
			await processConversation(conversation)
		}),
	)
}

// Run main in a loop with at least 1-second delay between iterations
async function runLoop() {
	const startTime = Date.now()
	try {
		await main()
	} catch (error) {
		console.error('Error in main loop:', error)
	}

	const runtime = Date.now() - startTime
	const delay = Math.max(0, 1000 - runtime)

	// Schedule next iteration after appropriate delay
	setTimeout(runLoop, delay)
}

// Start the loop
void runLoop()
