import { tool } from 'ai'
import { z } from 'zod'
import { type DiscordClient } from '../discord/client'

export function discord({
	conversationId,
	discordClient,
}: {
	conversationId: string
	discordClient: DiscordClient
}) {
	return {
		discord: tool({
			description: `Send a message to a Discord channel.
            You can use Discord-compatible markdown.`,
			parameters: z.object({
				message: z.string().max(2000),
			}),
			execute: async ({ message }: { message: string }) => {
				await discordClient.sendMessage(conversationId, message)
			},
		}),
	}
}
