import { experimental_createMCPClient, generateText, tool } from 'ai'
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio'
import { z } from 'zod'
import { config, type MCPConfig } from '../config'
import { logger } from '../core/logger'
import { openrouter } from '../llm/models'

logger.info('[MCP Tools] Loading...')

const interpolateEnvVars = (str: string): string => {
	return str.replace(/\${([^}]+)}/g, (_, key) => {
		const value = process.env[key]
		if (!value) {
			throw new Error(`Environment variable ${key} is not set`)
		}
		return value
	})
}

const createClient = async (
	name: string,
	config: MCPConfig['clients'][string],
) => {
	logger.debug(
		`[MCP Tools] Starting client creation for ${name} with type: ${config.type}`,
	)

	if (config.type === 'stdio') {
		logger.debug(`[MCP Tools] Setting up stdio transport for ${name}`)
		if (!config.command || !config.args) {
			throw new Error(`Invalid stdio config for ${name}`)
		}

		logger.debug(`[MCP Tools] Interpolating environment variables for ${name}`)
		const args = config.args.map((arg) => interpolateEnvVars(arg))
		logger.debug(
			`[MCP Tools] Creating stdio client for ${name} with command: ${config.command} ${args.join(' ')}`,
		)

		try {
			const client = await experimental_createMCPClient({
				transport: new Experimental_StdioMCPTransport({
					command: config.command,
					args,
				}),
			})
			logger.debug(`[MCP Tools] Successfully created stdio client for ${name}`)
			return client
		} catch (error) {
			logger.error(`[MCP Tools] Error creating stdio client for ${name}`, {
				error,
			})
			throw error
		}
	} else if (config.type === 'sse') {
		logger.debug(`[MCP Tools] Setting up SSE transport for ${name}`)
		if (!config.url) {
			throw new Error(`Invalid sse config for ${name}`)
		}

		logger.debug(`[MCP Tools] Interpolating environment variables for ${name}`)
		const url = interpolateEnvVars(config.url)
		logger.debug(`[MCP Tools] Creating SSE client for ${name} with URL: ${url}`)

		try {
			const client = await experimental_createMCPClient({
				transport: {
					type: 'sse',
					url,
				},
			})
			logger.debug(`[MCP Tools] Successfully created SSE client for ${name}`)
			return client
		} catch (error) {
			logger.error(`[MCP Tools] Error creating SSE client for ${name}`, {
				error,
			})
			throw error
		}
	} else {
		throw new Error(`Unknown transport type: ${config.type}`)
	}
}

const createAgent = async (
	name: string,
	client: Awaited<ReturnType<typeof createClient>>,
	config: MCPConfig['clients'][string],
) => {
	if (!config.agent?.enabled) return null

	const agentConfig = config.agent
	const clientTools = await client.tools()

	// Generate agent card description
	const agentCard = await generateText({
		model: openrouter(agentConfig.model),
		prompt: `You are an AI agent delegated responsibility for these tools:

${Object.entries(clientTools)
	.map(([toolName, tool]) => `- ${toolName}: ${tool.description}`)
	.join('\n')}

Create a concise but detailed summary of the tools you have access to and the kinds
of things you can help with.
`,
		maxSteps: 1,
	})

	return tool({
		description: agentCard.text,
		parameters: z.object({
			request: z.string(),
		}),
		execute: async ({ request }) => {
			const response = await generateText({
				model: openrouter(agentConfig.model),
				prompt: `${agentConfig.prompt}\n\nRequest: ${request}`,
				maxSteps: agentConfig.maxSteps,
				tools: clientTools,
			})
			return JSON.stringify({
				text: response.text,
				finishReason: response.finishReason,
			})
		},
	})
}

const loadMCPTools = async () => {
	logger.debug('[MCP Tools] Starting to load tools...')
	const tools: Record<string, any> = {}

	for (const [name, clientConfig] of Object.entries(config.clients)) {
		logger.debug(`[MCP Tools] Processing client: ${name}`)
		const startTime = Date.now()

		try {
			logger.debug(`[MCP Tools] Creating client for ${name}...`)
			const client = await createClient(name, clientConfig)
			logger.debug(
				`[MCP Tools] Client created for ${name} in ${Date.now() - startTime}ms`,
			)

			if (clientConfig.agent?.enabled) {
				logger.debug(`[MCP Tools] Creating agent for ${name}...`)
				const agent = await createAgent(name, client, clientConfig)
				if (agent) {
					logger.debug(`[MCP Tools] Agent created for ${name}`)
					tools[`${name}Agent`] = agent
				}
			} else {
				logger.debug(`[MCP Tools] Loading tools for ${name}...`)
				const clientTools = await client.tools()
				logger.debug(
					`[MCP Tools] Loaded ${Object.keys(clientTools).length} tools for ${name}`,
				)
				Object.assign(tools, clientTools)
			}
		} catch (error) {
			logger.error(`[MCP Tools] Error processing client ${name}`, { error })
			throw error
		}

		logger.debug(
			`[MCP Tools] Completed processing ${name} in ${Date.now() - startTime}ms`,
		)
	}

	logger.debug(
		`[MCP Tools] Successfully loaded ${Object.keys(tools).length} total tools`,
	)
	return tools
}

export const tools = await loadMCPTools()

logger.info('[MCP Tools] Loaded')
