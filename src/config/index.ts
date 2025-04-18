import fs from 'fs'
import { parse } from 'yaml'
import { z } from 'zod'

const configSchema = z.object({
	name: z.string(),
})

export type Config = z.infer<typeof configSchema>

const loadConfig = (configPath: string): Config => {
	const configContent = fs.readFileSync(configPath, 'utf8')
	const parsedConfig = parse(configContent)
	return configSchema.parse(parsedConfig)
}

export const config = loadConfig('./config.yml')
