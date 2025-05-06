import { tool } from 'ai'
import { z } from 'zod'
import { sendMessage } from '../discord/actions/send-message'

export function discord({ conversationId }: { conversationId: string }) {
	return {
		discord: tool({
			description: `Send a message to a Discord channel.
            You can use Discord-compatible markdown.`,
			parameters: z.object({
				message: z.string().max(2000),
			}),
			execute: async ({ message }: { message: string }) => {
				await sendMessage(conversationId, message)
			},
		}),
	}
}
