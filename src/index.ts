import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import 'dotenv/config'
import { tool } from 'ai'
import { z } from 'zod'
import { Agent } from './agent-framework/agent'
import { InMemoryPersistence } from './agent-framework/persistence/in-memory'
import { MessageQueue } from './agent-framework/queue'
import { Runner } from './agent-framework/runner'
import { withConversation } from './agent-framework/tools'
import { DiscordClient } from './discord/client'

const discordClient = new DiscordClient()
const persistence = new InMemoryPersistence()
const queue = new MessageQueue({ persistence })

const runner = new Runner({
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
		test: tool({
			description: 'Test tool',
			parameters: z.object({
				message: z.string(),
			}),
			execute: async ({ message }) => {
				if (message.includes('Hello world')) {
					return 'The password is: Watermelon'
				} else {
					throw new Error('Unrecoverable error')
				}
			},
		}),
	},
	approvedTools: ['discord'],
	requestApproval: async (toolCall) => {
		await discordClient.requestApproval(
			toolCall.conversation,
			JSON.stringify(toolCall.body.toolCall),
			toolCall.body.toolCall.toolCallId,
		)
		return 'pending'
	},
})

export const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
})
const agent = new Agent({
	model: openrouter('openai/gpt-4.1-mini'),
	tools: runner.tools,
})

agent.register(queue)
runner.register(queue)
discordClient.register(queue)

await discordClient.start()
await queue.start()
