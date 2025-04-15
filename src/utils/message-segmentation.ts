import { z } from 'zod'

const DISCORD_MAX_MESSAGE_LENGTH = 2000

type Chunk = {
	type: 'text' | 'code'
	content: string
	language?: string
}

/**
 * Splits a message into chunks of text and code blocks
 */
const splitIntoChunks = (message: string): Chunk[] => {
	const chunks: Chunk[] = []
	let currentPosition = 0

	while (currentPosition < message.length) {
		// Find next code block
		const codeBlockStart = message.indexOf('```', currentPosition)

		if (codeBlockStart === -1) {
			// No more code blocks, add remaining text
			chunks.push({
				type: 'text',
				content: message.slice(currentPosition),
			})
			break
		}

		// Add text before code block
		if (codeBlockStart > currentPosition) {
			chunks.push({
				type: 'text',
				content: message.slice(currentPosition, codeBlockStart),
			})
		}

		// Extract code block
		const codeBlockEnd = message.indexOf('\n```', codeBlockStart + 3)
		if (codeBlockEnd === -1) {
			// Unclosed code block, treat as text
			chunks.push({
				type: 'text',
				content: message.slice(codeBlockStart),
			})
			break
		}

		// Extract language and content
		const codeContent = message.slice(codeBlockStart + 3, codeBlockEnd)
		let language = ''
		let content = codeContent

		// Check if there's a language specifier
		const firstNewline = codeContent.indexOf('\n')
		if (firstNewline !== -1) {
			const potentialLanguage = codeContent.slice(0, firstNewline).trim()
			language = potentialLanguage
			content = codeContent.slice(firstNewline + 1)
		}

		chunks.push({
			type: 'code',
			language,
			content,
		})

		currentPosition = codeBlockEnd + 4
	}

	return chunks
}

/**
 * Splits a text chunk into segments that fit within Discord's message length limit
 */
const splitTextChunk = (content: string): string[] => {
	if (!content) {
		return ['']
	}

	const segments: string[] = []
	let remainingContent = content

	while (remainingContent.length > DISCORD_MAX_MESSAGE_LENGTH) {
		// Try to find the last newline within the limit
		const lastNewlineIndex = remainingContent
			.slice(0, DISCORD_MAX_MESSAGE_LENGTH)
			.lastIndexOf('\n')

		// If no newline found, try to find the last whitespace
		const splitIndex =
			lastNewlineIndex !== -1
				? lastNewlineIndex
				: remainingContent.slice(0, DISCORD_MAX_MESSAGE_LENGTH).lastIndexOf(' ')

		// If no whitespace found, force split at max length
		const finalSplitIndex =
			splitIndex !== -1 ? splitIndex : DISCORD_MAX_MESSAGE_LENGTH

		// Add the segment and update remaining content
		segments.push(remainingContent.slice(0, finalSplitIndex))
		remainingContent = remainingContent.slice(finalSplitIndex)
	}

	// Add any remaining content
	if (remainingContent) {
		segments.push(remainingContent)
	}

	return segments
}

/**
 * Splits a code chunk into segments that fit within Discord's message length limit
 */
const splitCodeChunk = (chunk: Chunk): string[] => {
	if (chunk.type !== 'code') {
		throw new Error('Expected code chunk')
	}

	if (!chunk.content) {
		return ['```\n```']
	}

	const segments: string[] = []
	let remainingContent = chunk.content.trim()

	// Calculate available space for code content
	// Need space for opening ``` + language + \n and closing ```
	const languagePrefix = chunk.language ? `\`\`\`${chunk.language}\n` : '```\n'
	const closingBackticks = '\n```'
	const availableSpace =
		DISCORD_MAX_MESSAGE_LENGTH -
		(languagePrefix.length + closingBackticks.length)

	while (remainingContent.length > 0) {
		if (remainingContent.length <= availableSpace) {
			// Can fit entire code block
			segments.push(`${languagePrefix}${remainingContent}${closingBackticks}`)
			break
		}

		// Try to split at newlines
		let splitIndex = remainingContent.slice(0, availableSpace).lastIndexOf('\n')

		// If no newlines found or would result in empty segment, force split at max length
		if (splitIndex <= 0) {
			splitIndex = availableSpace
		}

		// Add segment with proper code block formatting
		segments.push(
			`${languagePrefix}${remainingContent.slice(0, splitIndex)}${closingBackticks}`,
		)

		// Update remaining content and trim any leading whitespace
		remainingContent = remainingContent.slice(splitIndex).trimStart()
	}

	return segments
}

/**
 * Splits a message into segments that fit within Discord's message length limit.
 * Handles code blocks properly by ensuring they are not split in the middle.
 *
 * @param message - The message to segment
 * @returns Array of message segments, each under DISCORD_MAX_MESSAGE_LENGTH characters
 */
export const segmentMessage = (message: string): string[] => {
	const chunks = splitIntoChunks(message)
	const segments: string[] = []
	let currentSegment = ''

	for (const chunk of chunks) {
		if (chunk.type === 'text') {
			if (
				currentSegment.length + chunk.content.length <=
				DISCORD_MAX_MESSAGE_LENGTH
			) {
				// Add to current segment
				currentSegment += chunk.content
			} else {
				// Need to split
				if (currentSegment.length > 0) {
					segments.push(currentSegment)
					currentSegment = ''
				}

				// Split the text chunk using existing logic
				const textSegments = splitTextChunk(chunk.content)
				segments.push(...textSegments)
			}
		} else {
			// For code blocks, we need to account for the backticks
			const languagePrefix = chunk.language
				? `\`\`\`${chunk.language}\n`
				: '```\n'
			const closingBackticks = '\n```'
			const codeBlockWithBackticks = `${languagePrefix}${chunk.content}${closingBackticks}`

			if (
				currentSegment.length + codeBlockWithBackticks.length <=
				DISCORD_MAX_MESSAGE_LENGTH
			) {
				// Add to current segment
				currentSegment += codeBlockWithBackticks
			} else {
				// Need to split
				if (currentSegment.length > 0) {
					segments.push(currentSegment)
					currentSegment = ''
				}

				// Split the code chunk
				const codeSegments = splitCodeChunk(chunk)
				segments.push(...codeSegments)
			}
		}
	}

	// Add any remaining segment
	if (currentSegment.length > 0) {
		segments.push(currentSegment)
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
