import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
	APICallError,
	generateText,
	InvalidToolArgumentsError,
	type CoreMessage,
	type CoreToolMessage,
	type ToolContent,
	type ToolSet,
} from 'ai'
import 'dotenv/config'
import { systemPrompt } from './config/system-prompt'
import { logger } from './core/logger'
import { prisma } from './db'
import { ensureConversation } from './db/ensureConversation'
import { requestApproval } from './discord/actions/request-approval'
import { setupMCPServersChannel } from './discord/actions/setup-mcp-servers-channel'
import { setupMCPToolsChannel } from './discord/actions/setup-mcp-tools-channel'
import { discordClient } from './discord/client'
import { processToolCall, toolStubs } from './tools'
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
	const mostRecentMessage = messages
		.filter((msg) => msg.shouldTrigger)
		.reduce<
			(typeof messages)[number] | null
		>((max, msg) => (max && max.createdAt > msg.createdAt ? max : msg), null)

	const hasNewMessages =
		mostRecentMessage &&
		(!conversation.lastProcessedMessageTimestamp ||
			mostRecentMessage.createdAt > conversation.lastProcessedMessageTimestamp)

	if (!hasNewMessages && pendingToolCalls.length === 0) {
		return // No new messages or tool calls to process
	}

	// set up tools
	const toolset: ToolSet = {
		...(await mcp()),
		...scheduler({ conversationId: conversation.id }),
		...discord({
			conversationId: conversation.id,
		}),
	}

	// Execute approved tool calls in parallel
	await Promise.all(
		pendingToolCalls.map((toolCall) =>
			processToolCall(toolCall, toolset, conversation.id),
		),
	)

	if (!hasNewMessages || messages.length === 0) {
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
			system: systemPrompt(),
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
						// Check if the tool requires approval
						const tool = await prisma.tool.findFirst({
							where: {
								name: toolCall.toolName,
							},
						})

						const requiresApproval = tool?.requiresApproval ?? false
						const status = requiresApproval
							? 'waiting-for-approval'
							: 'approved'

						const createdToolCall = await prisma.toolCall.create({
							data: {
								id: toolCall.toolCallId,
								messageId: storedMessage.id,
								toolName: toolCall.toolName,
								toolInput: JSON.stringify(toolCall.args),
								status,
							},
						})

						// If approval is required, trigger the approval request
						if (requiresApproval) {
							const jsonStr = JSON.stringify(toolCall.args, null, 2)
							const truncatedJson =
								jsonStr.length > 1900
									? jsonStr.slice(0, 1896) + '\n...'
									: jsonStr

							await requestApproval(
								conversation.id,
								`Tool call requested: ${toolCall.toolName}\nInput: \`\`\`json\n${truncatedJson}\n\`\`\``,
								createdToolCall.id,
							)
						}

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

		if (InvalidToolArgumentsError.isInstance(error)) {
			// Create a message to inform the LLM about the invalid tool arguments
			await prisma.message.create({
				data: {
					conversationId: conversation.id,
					role: 'user',
					content: `The previous tool call had invalid arguments: ${error.message}. Please try again with valid arguments.`,
					shouldTrigger: true,
				},
			})
		}
	}

	// Update conversation's last processed message ID
	await prisma.conversation.update({
		where: { id: conversation.id },
		data: {
			lastProcessedMessageTimestamp: mostRecentMessage.createdAt,
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
