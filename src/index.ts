import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import 'dotenv/config'
import { experimental_createMCPClient, tool } from 'ai'
import { z } from 'zod'
import { Agent } from './agent-framework/agent'
import { MessageQueue } from './agent-framework/queue'
import { Runner } from './agent-framework/runner'
import { withConversation } from './agent-framework/tools'
import { config } from './config'
import { DiscordClient } from './discord/client'
import { QueueRepository, AgentRepository } from './sqlite'
import { createWebhookServer } from './webhook/server'

const discordClient = new DiscordClient()
const queueRepository = new QueueRepository()
const agentRepository = new AgentRepository()
const queue = new MessageQueue({ repository: queueRepository })

// Create MCP clients for each server
const mcpClients = await Promise.all(
	config.mcp.map(async (server) => {
		try {
			const client = await experimental_createMCPClient({
				transport: {
					type: 'sse',
					url: server.url,
					headers: server.authorization
						? {
								Authorization: `Bearer ${server.authorization.bearer}`,
							}
						: undefined,
				},
			})
			return {
				client,
				approvedTools: server.approvedTools,
			}
		} catch (error) {
			console.error(`Failed to connect to MCP server at ${server.url}:`, error)
			return null
		}
	}),
).then((results) =>
	results.filter(
		(result): result is NonNullable<typeof result> => result !== null,
	),
)

if (mcpClients.length === 0) {
	console.error(
		'No MCP clients could be initialized. The application will start with limited functionality.',
	)
}

// Combine all tools and approved tools
const allTools = await Promise.all(
	mcpClients.map(({ client }) => client.tools()),
)
const allApprovedTools = mcpClients.flatMap(
	({ approvedTools }) => approvedTools,
)

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
		...Object.assign({}, ...allTools),
	},
	approvedTools: ['discord', ...allApprovedTools],
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

The current time is ${new Date().toLocaleString()}.

You are on a Discord server, so you can use the user's snowflake to identify them
for tool calls or tag them in messages. For example, "<@123456>".`,
})

agent.register(queue)
runner.register(queue)
discordClient.register(queue)

// Start the webhook server
createWebhookServer(queue)

await discordClient.start()
await queue.start()
