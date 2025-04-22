import fs from 'fs'
import { parse } from 'yaml'
import { z } from 'zod'

const authorizationSchema = z.object({
	bearer: z.string(),
})

const mcpServerSchema = z.object({
	url: z.string().url(),
	authorization: authorizationSchema.optional(),
	approvedTools: z.array(z.string()).default([]),
})

const configSchema = z.object({
	name: z.string(),
	mcp: z.array(mcpServerSchema),
})

export type Config = z.infer<typeof configSchema>
export type MCPServer = z.infer<typeof mcpServerSchema>

const substituteEnvVars = (value: string): string => {
	return value.replace(/\${{ env\.([^}]+) }}/g, (_, envVar) => {
		const value = process.env[envVar]
		if (!value) {
			throw new Error(`Environment variable ${envVar} not found`)
		}
		return value
	})
}

const loadConfig = (configPath: string): Config => {
	const configContent = fs.readFileSync(configPath, 'utf8')
	const parsedConfig = parse(configContent)

	// Substitute environment variables in the config
	const processedConfig = JSON.parse(
		JSON.stringify(parsedConfig).replace(
			/"\${{ env\.([^}]+) }}"/g,
			(_, envVar) => {
				const value = process.env[envVar]
				if (!value) {
					throw new Error(`Environment variable ${envVar} not found`)
				}
				return JSON.stringify(value)
			},
		),
	)

	return configSchema.parse(processedConfig)
}

export const config = loadConfig('./config.yml')
