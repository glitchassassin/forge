import { streamText } from 'ai'
import { addMessageToContext, getChannelContext } from '../core/database'
import { type DiscordClient } from '../core/discord/client'
import { QUASAR_ALPHA } from '../llm/models'
import { MAIN_PROMPT } from '../llm/prompts'
import { GITHUB } from '../tools/github'
import { scheduleTools } from '../tools/schedule'
import { withConfirmation } from '../tools/withConfirmation'
import { withLogging } from '../tools/withLogging'
import { type Event } from '../types/events'

export const createEventHandler = (discordClient: DiscordClient) => {
	return async (event: Event): Promise<void> => {
		let currentMessage = ''

		try {
			// Start typing indicator
			await discordClient.startTyping(event.channel)

			// Get previous context for this channel
			const previousContext = await getChannelContext(event.channel)

			// Combine previous context with current messages
			const allMessages = [...previousContext, ...event.messages]

			const stream = streamText({
				model: QUASAR_ALPHA,
				messages: allMessages,
				system: MAIN_PROMPT(),
				tools: {
					...withConfirmation(await GITHUB.tools(), async (toolName, args) => {
						const content = `Do you want to execute the ${toolName} tool with these arguments?\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``
						return discordClient.requestConfirmation(event.channel, content)
					}),
					...withLogging(scheduleTools(event.channel)),
				},
				maxSteps: 10,
			})

			for await (const chunk of stream.fullStream) {
				if (chunk.type === 'text-delta') {
					currentMessage += chunk.textDelta

					// Split on double newlines to send paragraphs
					const paragraphs = currentMessage.split('\n\n')

					// If we have more than one paragraph, send all but the last one
					if (paragraphs.length > 1) {
						for (let i = 0; i < paragraphs.length - 1; i++) {
							const paragraph = paragraphs[i]?.trim()
							if (paragraph) {
								await discordClient.sendMessage(event.channel, paragraph)
							}
						}
						// Keep the last (potentially incomplete) paragraph
						currentMessage = paragraphs[paragraphs.length - 1] ?? ''
					}
				} else {
					// If we have any pending text, send it first
					if (currentMessage.trim()) {
						await discordClient.sendMessage(
							event.channel,
							currentMessage.trim(),
						)
						currentMessage = ''
					}
				}
				// Restart typing indicator after sending a message
				await discordClient.startTyping(event.channel)
			}

			// Send any remaining text
			if (currentMessage.trim()) {
				await discordClient.sendMessage(event.channel, currentMessage.trim())
			}

			// Store the conversation in context
			for (const message of event.messages) {
				await addMessageToContext(event.channel, message)
			}

			// Store the assistant's response
			for (const message of (await stream.response).messages) {
				await addMessageToContext(event.channel, message)
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
