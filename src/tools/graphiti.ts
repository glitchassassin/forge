import { experimental_createMCPClient } from 'ai'

if (!process.env.GRAPHITI_URL) {
	throw new Error('GRAPHITI_URL is not set')
}

export const GRAPHITI = await experimental_createMCPClient({
	transport: {
		type: 'sse',
		url: process.env.GRAPHITI_URL,
	},
})
