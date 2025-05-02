import { logger } from '../core/logger'
import { type DiscordClient } from '../discord/client'

/**
 * Handles errors by logging them to both console and Discord status channel
 * @param error - The error to handle
 * @param context - Optional context about where the error occurred
 * @param discordClient - The Discord client instance to use for status updates
 */
export async function handleError(
	error: unknown,
	context?: string,
	discordClient?: DiscordClient,
): Promise<void> {
	// Format error message
	const errorMessage = error instanceof Error ? error.message : String(error)
	const stackTrace = error instanceof Error ? error.stack : undefined
	const timestamp = new Date().toISOString()

	// Create detailed error message
	const detailedMessage = `[${timestamp}] Error${context ? ` in ${context}` : ''}: ${errorMessage}${
		stackTrace ? `\nStack trace:\n${stackTrace}` : ''
	}`

	// Log to console using winston logger
	logger.error(detailedMessage)

	// If Discord client is provided, send to status channel
	if (discordClient) {
		try {
			// Create a more concise message for Discord
			const discordMessage = `❌ Error${context ? ` in ${context}` : ''}: ${errorMessage}`
			await discordClient.logStatus(discordMessage)
		} catch (discordError) {
			// If Discord logging fails, log that too
			logger.error('Failed to log error to Discord', { error: discordError })
		}
	}
}
