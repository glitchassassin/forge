import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import 'dotenv/config'
import { tool } from 'ai'
import { z } from 'zod'
import { Agent } from './agent-framework/agent'
import { MessageQueue } from './agent-framework/queue'
import { Runner } from './agent-framework/runner'
import { withConversation } from './agent-framework/tools'
import { DiscordClient } from './discord/client'
import { QueueRepository, AgentRepository } from './sqlite'
import { createWebhookServer } from './webhook/server'

const discordClient = new DiscordClient()
const queueRepository = new QueueRepository()
const agentRepository = new AgentRepository()
const queue = new MessageQueue({ repository: queueRepository })

const runner = new Runner({
	tools: {
		discord: withConversation((conversation) =>
			tool({
				description: `Send a message to a Discord channel.
					You can use Discord-compatible markdown.`,
				parameters: z.object({
					message: z.string().max(2000),
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
			`Calling tool \`${toolCall.body.toolCall.toolName}\`:\n\`\`\`json\n${JSON.stringify(toolCall.body.toolCall.args, null, 2)}\`\`\``,
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
	repository: agentRepository,
	system: `You are Forge, an advanced AI agent.

Your personality is precise, concise, and to the point. Don't worry about formalities.
Critique my ideas freely and without sycophancy. I value honesty over politeness.

The current time is ${new Date().toLocaleString()}.`,
})

agent.register(queue)
runner.register(queue)
discordClient.register(queue)

// Start the webhook server
createWebhookServer(queue)

await discordClient.start()
await queue.start()
