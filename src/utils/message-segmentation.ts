import { z } from 'zod'

const DISCORD_MAX_MESSAGE_LENGTH = 2000

/**
 * Splits a message into segments that fit within Discord's message length limit.
 * Tries to split on newlines first, then falls back to whitespace if needed.
 *
 * @param message - The message to segment
 * @returns Array of message segments, each under DISCORD_MAX_MESSAGE_LENGTH characters
 */
export const segmentMessage = (message: string): string[] => {
	const segments: string[] = []
	let remainingMessage = message

	while (remainingMessage.length > DISCORD_MAX_MESSAGE_LENGTH) {
		// Try to find the last newline within the limit
		const lastNewlineIndex = remainingMessage
			.slice(0, DISCORD_MAX_MESSAGE_LENGTH)
			.lastIndexOf('\n')

		// If no newline found, try to find the last whitespace
		const splitIndex =
			lastNewlineIndex !== -1
				? lastNewlineIndex
				: remainingMessage.slice(0, DISCORD_MAX_MESSAGE_LENGTH).lastIndexOf(' ')

		// If no whitespace found, force split at max length
		const finalSplitIndex =
			splitIndex !== -1 ? splitIndex : DISCORD_MAX_MESSAGE_LENGTH

		// Add the segment and update remaining message
		segments.push(remainingMessage.slice(0, finalSplitIndex).trim())
		remainingMessage = remainingMessage.slice(finalSplitIndex).trim()
	}

	// Add any remaining message
	if (remainingMessage) {
		segments.push(remainingMessage)
	}

	return segments
}

/**
 * Validates that a message is within Discord's message length limit.
 *
 * @param message - The message to validate
 * @returns Whether the message is valid
 */
export const isValidDiscordMessage = (message: string): boolean => {
	return message.length <= DISCORD_MAX_MESSAGE_LENGTH
}

/**
 * Schema for validating Discord message length
 */
export const discordMessageSchema = z.string().max(DISCORD_MAX_MESSAGE_LENGTH, {
	message: `Message must be ${DISCORD_MAX_MESSAGE_LENGTH} characters or less`,
})
