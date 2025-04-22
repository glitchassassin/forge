import fs from 'fs'
import { parse } from 'yaml'
import { z } from 'zod'

const mcpServerSchema = z.object({
	url: z.string().url(),
	approvedTools: z.array(z.string()).default([]),
})

const configSchema = z.object({
	name: z.string(),
	mcp: z.array(mcpServerSchema),
})

export type Config = z.infer<typeof configSchema>
export type MCPServer = z.infer<typeof mcpServerSchema>

const loadConfig = (configPath: string): Config => {
	const configContent = fs.readFileSync(configPath, 'utf8')
	const parsedConfig = parse(configContent)
	return configSchema.parse(parsedConfig)
}

export const config = loadConfig('./config.yml')
