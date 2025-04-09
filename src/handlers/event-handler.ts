import { streamText } from 'ai'
import { Database } from '../core/database'
import { type DiscordClient } from '../core/discord/client'
import { QUASAR_ALPHA } from '../llm/models'
import { MAIN_PROMPT } from '../llm/prompts'
import { GITHUB } from '../tools/github'
import { scheduleTools } from '../tools/schedule'
import { withConfirmation } from '../tools/withConfirmation'
import { type Event } from '../types/events'
export const createEventHandler = (
	discordClient: DiscordClient,
	db: Database,
) => {
	return async (event: Event): Promise<void> => {
		console.log('Processing event:', {
			type: event.type,
			channel: event.channel,
			messageCount: event.messages.length,
		})

		let currentMessage = ''

		try {
			// Start typing indicator
			await discordClient.startTyping(event.channel)

			const stream = streamText({
				model: QUASAR_ALPHA,
				messages: event.messages,
				system: MAIN_PROMPT(),
				tools: {
					...withConfirmation(await GITHUB.tools(), async (toolName, args) => {
						const content = `Do you want to execute the ${toolName} tool with these arguments?\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``
						return discordClient.requestConfirmation(event.channel, content)
					}),
					...scheduleTools(db, event.channel),
				},
				maxSteps: 10,
			})

			for await (const chunk of stream.textStream) {
				currentMessage += chunk

				// Split on double newlines to send paragraphs
				const paragraphs = currentMessage.split('\n\n')

				// If we have more than one paragraph, send all but the last one
				if (paragraphs.length > 1) {
					for (let i = 0; i < paragraphs.length - 1; i++) {
						const paragraph = paragraphs[i]?.trim()
						if (paragraph) {
							await discordClient.sendMessage(event.channel, paragraph)
							// Restart typing indicator after sending a message
							await discordClient.startTyping(event.channel)
						}
					}
					// Keep the last (potentially incomplete) paragraph
					currentMessage = paragraphs[paragraphs.length - 1] ?? ''
				}
			}

			// Send any remaining text
			if (currentMessage.trim()) {
				await discordClient.sendMessage(event.channel, currentMessage.trim())
			}
		} catch (error) {
			console.error('Error processing event:', error)
			await discordClient.sendMessage(
				event.channel,
				'Sorry, I encountered an error processing your request.',
			)
		}
	}
}
