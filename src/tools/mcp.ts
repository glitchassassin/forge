import { experimental_createMCPClient, type ToolSet } from 'ai'
import { logger } from '../core/logger'
import { prisma } from '../db'

export async function mcp(): Promise<ToolSet> {
	try {
		// Get all MCPServers configured
		const servers = await prisma.mcpServer.findMany({
			include: {
				tools: true,
			},
		})

		// Create MCPClient for each server
		const clientTools = await Promise.all(
			servers.map(async (server) => {
				try {
					const client = await experimental_createMCPClient({
						transport: {
							type: 'sse',
							url: server.url,
							headers: {
								Authorization: `Bearer ${server.authToken}`,
							},
						},
					})

					const tools = await client.tools()

					// Create Tool records for any new tools
					const existingToolNames = new Set(server.tools.map((t) => t.name))
					const newTools = Object.keys(tools).filter(
						(name) => !existingToolNames.has(name),
					)

					if (newTools.length > 0) {
						await prisma.tool.createMany({
							data: newTools.map((name) => ({
								mcpServerId: server.id,
								name,
								requiresApproval: true,
							})),
						})

						logger.info('Created new tool records', {
							serverId: server.id,
							tools: newTools,
						})
					}

					return tools
				} catch (error) {
					logger.error('Error creating MCP client', {
						error,
						serverUrl: server.url,
					})
					return null
				}
			}),
		)

		// Filter out failed clients and flatten tools
		const validTools = clientTools.filter(
			(tools): tools is NonNullable<typeof tools> => tools !== null,
		)
		const allTools = validTools.reduce((acc, tools) => {
			return { ...acc, ...tools }
		}, {})

		return allTools
	} catch (error) {
		logger.error('Error setting up MCP tools', { error })
		return {}
	}
}
