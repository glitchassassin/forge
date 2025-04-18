import { describe, expect, it } from 'vitest'
import { isValidDiscordMessage, segmentMessage } from './message-segmentation'

describe('message-segmentation', () => {
	describe('isValidDiscordMessage', () => {
		it('should return true for messages under the limit', () => {
			expect(isValidDiscordMessage('a'.repeat(1999))).toBe(true)
		})

		it('should return true for messages at the limit', () => {
			expect(isValidDiscordMessage('a'.repeat(2000))).toBe(true)
		})

		it('should return false for messages over the limit', () => {
			expect(isValidDiscordMessage('a'.repeat(2001))).toBe(false)
		})
	})

	describe('segmentMessage', () => {
		it('should handle empty messages', () => {
			expect(segmentMessage('')).toEqual([])
		})

		it('should handle messages under the limit', () => {
			const message = 'Hello, world!'
			expect(segmentMessage(message)).toEqual([message])
		})

		it('should split long text messages at newlines', () => {
			const message = 'a\n'.repeat(1000) + 'b'
			const segments = segmentMessage(message)
			expect(segments.length).toBeGreaterThan(1)
			expect(segments.every((segment) => segment.length <= 2000)).toBe(true)
			expect(segments.join('')).toBe(message)
		})

		it('should split long text messages at spaces if no newlines', () => {
			const message = 'a '.repeat(1000) + 'b'
			const segments = segmentMessage(message)
			expect(segments.length).toBeGreaterThan(1)
			expect(segments.every((segment) => segment.length <= 2000)).toBe(true)
			expect(segments.join('')).toBe(message)
		})

		it('should handle code blocks under the limit', () => {
			const message = 'Here is some code:\n```typescript\nconst x = 1;\n```'
			expect(segmentMessage(message)).toEqual([message])
		})

		it('should preserve code block language when splitting', () => {
			const message = '```typescript\n' + 'const x = 1;\n'.repeat(1000) + '```'
			const segments = segmentMessage(message)
			expect(segments.length).toBeGreaterThan(1)
			expect(
				segments.every((segment) => segment.startsWith('```typescript\n')),
			).toBe(true)
			expect(segments.every((segment) => segment.endsWith('\n```'))).toBe(true)
		})

		it('should handle mixed text and code blocks', () => {
			const message =
				'Text before\n```typescript\nconst x = 1;\n```\nText after'
			expect(segmentMessage(message)).toEqual([message])
		})

		it('should handle multiple code blocks', () => {
			const message =
				'```typescript\nconst x = 1;\n```\n```javascript\nconst y = 2;\n```'
			expect(segmentMessage(message)).toEqual([message])
		})

		it('should handle unclosed code blocks', () => {
			const message = '```typescript\nconst x = 1;'
			const segments = segmentMessage(message)
			expect(segments.length).toBe(1)
			expect(segments[0]).toBe(message)
		})

		it('should handle code blocks with no language', () => {
			const message = '```\nconst x = 1;\n```'
			expect(segmentMessage(message)).toEqual([message])
		})

		it('should handle very long code blocks', () => {
			const message = '```typescript\n' + 'const x = 1;\n'.repeat(1000) + '```'
			const segments = segmentMessage(message)
			expect(segments.length).toBeGreaterThan(1)
			expect(segments.every((segment) => segment.length <= 2000)).toBe(true)
		})

		it('should handle code blocks with long lines', () => {
			const longLine = 'const x = ' + '1'.repeat(1000) + ';'
			const message = `\`\`\`typescript\n${longLine}\n\`\`\``
			const segments = segmentMessage(message)
			expect(segments.length).not.toBeGreaterThan(1)
			expect(segments.every((segment) => segment.length <= 2000)).toBe(true)
			expect(segments.join('')).toBe(message)
		})

		it('should handle complex mixed content', () => {
			const message =
				'Some text\n' +
				'```typescript\n' +
				'const x = 1;\n'.repeat(500) +
				'```\n' +
				'More text\n' +
				'```javascript\n' +
				'const y = 2;\n'.repeat(500) +
				'```\n' +
				'Final text'

			const segments = segmentMessage(message)
			expect(segments.length).toBeGreaterThan(1)
			expect(segments.every((segment) => segment.length <= 2000)).toBe(true)
		})
	})
})
