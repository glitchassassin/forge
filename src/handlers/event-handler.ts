import { streamText } from 'ai'
import { config } from '../config'
import { addMessageToContext, getChannelContext } from '../core/database'
import { type DiscordClient } from '../core/discord/client'
import { logger } from '../core/logger'
import { openrouter } from '../llm/models'
import { MAIN_PROMPT } from '../llm/prompts'
import { tools } from '../tools/mcp-loader'
import { scheduleTools } from '../tools/schedule'
import { withLogging } from '../tools/withLogging'
import { type Event } from '../types/events'
import { segmentMessage } from '../utils/message-segmentation'

interface StreamError {
	name: string
	message: string
}

export const createEventHandler = (discordClient: DiscordClient) => {
	const model = openrouter(config.model)

	return async (event: Event): Promise<void> => {
		logger.debug('Processing event', {
			type: event.type,
			channel: event.channel,
			messageCount: event.messages.length,
		})
		let currentMessage = ''

		try {
			// Start typing indicator
			await discordClient.startTyping(event.channel)

			// Get previous context for this channel
			const previousContext = await getChannelContext(event.channel)

			// Combine previous context with current messages
			const allMessages = [...previousContext, ...event.messages]

			const stream = streamText({
				model,
				messages: allMessages,
				system: MAIN_PROMPT(),
				tools: {
					...withLogging(tools),
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
								// Use message segmentation for each paragraph
								const segments = segmentMessage(paragraph)
								for (const segment of segments) {
									await discordClient.sendMessage(event.channel, segment)
								}
							}
						}
						// Keep the last (potentially incomplete) paragraph
						currentMessage = paragraphs[paragraphs.length - 1] ?? ''
					}
				} else if (chunk.type === 'error') {
					logger.error('Stream interrupted with error', { error: chunk.error })

					// Handle specific error types
					const error = chunk.error as StreamError
					if (error.name === 'AI_TypeValidationError') {
						await discordClient.sendMessage(
							event.channel,
							"I'm having trouble processing the response from the AI service. This might be due to an API issue. Please try again in a moment.",
						)
					} else if (error.name === 'AI_ProviderError') {
						await discordClient.sendMessage(
							event.channel,
							'The AI service is currently experiencing issues. Please try again later.',
						)
					} else {
						await discordClient.sendMessage(
							event.channel,
							'An unexpected error occurred while processing your request. Please try again.',
						)
					}

					// Log detailed error information for debugging
					logger.error('Detailed error information', {
						error: chunk.error,
						channel: event.channel,
						eventType: event.type,
						messageCount: event.messages.length,
						lastMessage: event.messages[event.messages.length - 1]?.content,
						contextLength: allMessages.length,
					})

					return
				} else {
					// If we have any pending text, send it first
					if (currentMessage.trim()) {
						const segments = segmentMessage(currentMessage.trim())
						for (const segment of segments) {
							await discordClient.sendMessage(event.channel, segment)
						}
						currentMessage = ''
					}
				}

				// Restart typing indicator after sending a message
				await discordClient.startTyping(event.channel)
			}

			// Send any remaining text
			if (currentMessage.trim()) {
				const segments = segmentMessage(currentMessage.trim())
				for (const segment of segments) {
					await discordClient.sendMessage(event.channel, segment)
				}
			}

			// Store the conversation in context
			for (const message of event.messages) {
				await addMessageToContext(event.channel, message)
			}

			// Store the assistant's response
			for (const message of (await stream.response).messages) {
				await addMessageToContext(event.channel, message)
			}
			const finishReason = await stream.finishReason
			logger.debug('Response finishReason', { finishReason })

			if (finishReason === 'error') {
				logger.error('Stream finished with error', {
					channel: event.channel,
					eventType: event.type,
					messageCount: event.messages.length,
					lastMessage: event.messages[event.messages.length - 1]?.content,
					contextLength: allMessages.length,
				})

				await discordClient.sendMessage(
					event.channel,
					'The conversation was interrupted due to an error. Please try your request again.',
				)
			}

			const warnings = await stream.warnings
			if (warnings) {
				logger.warn('Stream warnings', { warnings })
			}
		} catch (error) {
			logger.error('Error processing event', { error })

			// Provide more specific error messages based on the error type
			if (error instanceof Error) {
				if (error.message.includes('API key')) {
					await discordClient.sendMessage(
						event.channel,
						"I'm having trouble connecting to the AI service. This might be due to an invalid API key. Please check the configuration.",
					)
				} else if (error.message.includes('rate limit')) {
					await discordClient.sendMessage(
						event.channel,
						'The AI service is currently rate limited. Please try again in a few moments.',
					)
				} else {
					await discordClient.sendMessage(
						event.channel,
						'An unexpected error occurred while processing your request. Please try again later.',
					)
				}
			} else {
				await discordClient.sendMessage(
					event.channel,
					'An unexpected error occurred while processing your request. Please try again later.',
				)
			}
		}
	}
}
