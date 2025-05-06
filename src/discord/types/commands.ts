import { ChatInputCommandInteraction, Guild } from 'discord.js'

export interface Command {
	metadata: {
		name: string
		description: string
	}
	execute: (
		interaction: ChatInputCommandInteraction,
		guild: Guild,
	) => Promise<void>
}
