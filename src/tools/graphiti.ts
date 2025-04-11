import { experimental_createMCPClient } from 'ai'

export const GRAPHITI = await experimental_createMCPClient({
    transport: {
        type: 'sse',
        url: 'http://localhost:7575/sse',
    },
}) 