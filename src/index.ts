import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import 'dotenv/config'
import { Agent } from './agent-framework/agent'
import { Approver } from './agent-framework/approver'
import { InMemoryPersistence } from './agent-framework/persistence/in-memory'
import { MessageQueue } from './agent-framework/queue'
import { Runner } from './agent-framework/runner'
import { ApprovalResponseMessage } from './agent-framework/types'
import { logger } from './core/logger'
import { DiscordClient } from './discord/client'

const discordClient = new DiscordClient()

const persistence = new InMemoryPersistence()
const queue = new MessageQueue({ persistence })

discordClient.emitter.on('message', (message) => {
	queue.send(message)
})
const approver: Approver = {
	requestApproval: (toolCall) =>
		discordClient.requestApproval(
			toolCall.conversation,
			JSON.stringify(toolCall.body.toolCall),
			toolCall.body.toolCall.toolCallId,
		),
	onApprovalResponse: (handler) => {
		discordClient.emitter.on(
			'toolCallConfirmation',
			async (toolCallId, approved) => {
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
				handler(message)
			},
		)
	},
}

export const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
})
const agent = new Agent({
	model: openrouter('openai/gpt-4.1-mini'),
})
const runner = new Runner({ agent, approver })

runner.register(queue)
