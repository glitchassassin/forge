import fs from 'fs'
import { parse } from 'yaml'
import { z } from 'zod'

const DEFAULT_MODEL = 'openrouter/optimus-alpha'

const mcpConfigSchema = z.object({
	model: z.string().default(DEFAULT_MODEL),
	clients: z.record(
		z.string(),
		z.object({
			type: z.enum(['stdio', 'sse']),
			command: z.string().optional(),
			args: z.array(z.string()).optional(),
			url: z.string().optional(),
			agent: z
				.object({
					enabled: z.boolean().default(false),
					model: z.string().default(DEFAULT_MODEL),
					maxSteps: z.number().default(10),
					prompt: z
						.string()
						.default(
							'You are an agent with responsibility for these tools. You are given a request to perform an operation. You need to use the available tools to perform the operation. Then, report the results in a concise but detailed manner.',
						),
				})
				.optional(),
		}),
	),
})

export type MCPConfig = z.infer<typeof mcpConfigSchema>

const loadConfig = (configPath: string): MCPConfig => {
	const configContent = fs.readFileSync(configPath, 'utf8')
	const parsedConfig = parse(configContent)
	return mcpConfigSchema.parse(parsedConfig)
}

export const config = loadConfig('./config.yml')
