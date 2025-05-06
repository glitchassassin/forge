import { ChatInputCommandInteraction, Guild, MessageFlags } from 'discord.js'
import { logger } from '../../core/logger'
import { Command } from '../types/commands'
import {
	findNextChannelNumber,
	findOrCreateForgeChannel,
} from '../utils/channel-utils'

export const newChannelCommand: Command = {
	metadata: {
		name: 'new',
		description: 'Create a new forge channel',
	},
	execute: async (
		interaction: ChatInputCommandInteraction,
		guild: Guild,
	): Promise<void> => {
		if (!interaction.guildId) {
			await interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			})
			return
		}

		try {
			const nextNumber = await findNextChannelNumber(guild)
			const channelName = `forge-${nextNumber}`
			const channelId = await findOrCreateForgeChannel(guild, channelName)

			await interaction.reply({
				content: `Created new channel <#${channelId}>.`,
				flags: MessageFlags.Ephemeral,
			})
		} catch (error) {
			logger.error('Error creating new channel', { error })
			await interaction.reply({
				content: 'Failed to create new channel. Please try again later.',
				flags: MessageFlags.Ephemeral,
			})
		}
	},
}
