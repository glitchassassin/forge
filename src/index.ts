import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import 'dotenv/config'
import { tool } from 'ai'
import { z } from 'zod'
import { Agent } from './agent-framework/agent'
import { InMemoryPersistence } from './agent-framework/persistence/in-memory'
import { MessageQueue } from './agent-framework/queue'
import { Runner } from './agent-framework/runner'
import { withConversation } from './agent-framework/tools'
import { type ApprovalResponseMessage } from './agent-framework/types'
import { logger } from './core/logger'
import { DiscordClient } from './discord/client'

const discordClient = new DiscordClient()

const persistence = new InMemoryPersistence()
const queue = new MessageQueue({ persistence })

discordClient.emitter.on('message', async (message) => {
	await queue.send(message)
})
discordClient.emitter.on(
	'toolCallConfirmation',
	async (toolCallId, approved) => {
		logger.debug('Approval response', { toolCallId, approved })
		// fetch the original tool call from the ID in the event
		const toolCall = await persistence.getToolCall(toolCallId)
		if (!toolCall) {
			logger.error(`Tool call ${toolCallId} not found`)
			return
		}
		// create a new approval response message
		const message: ApprovalResponseMessage<string, unknown> = {
			id: toolCallId,
			type: 'approval-response',
			body: {
				toolCall: toolCall.body.toolCall,
				messages: toolCall.body.messages,
				approved,
			},
			conversation: toolCall.conversation,
			created_at: toolCall.created_at,
			handled: false,
		}
		await queue.send(message)
	},
)

export const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
})
const agent = new Agent({
	model: openrouter('openai/gpt-4.1-mini'),
	tools: {
		discord: withConversation((conversation) =>
			tool({
				description: 'Send a message to a Discord channel',
				parameters: z.object({
					message: z.string(),
				}),
				execute: async ({ message }) => {
					await discordClient.sendMessage(conversation, message)
				},
			}),
		),
	},
})
const runner = new Runner({
	agent,
	requestApproval: async (toolCall) => {
		if (toolCall.body.toolCall.toolName === 'discord') {
			return 'approved'
		}
		await discordClient.requestApproval(
			toolCall.conversation,
			JSON.stringify(toolCall.body.toolCall),
			toolCall.body.toolCall.toolCallId,
		)
		return 'pending'
	},
})

runner.register(queue)

await discordClient.start()
