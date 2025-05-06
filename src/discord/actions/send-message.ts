import { ChannelType } from 'discord.js'
import { discordClient } from '../client'

export const sendMessage = async (
	channelId: string,
	content: string,
): Promise<void> => {
	const channel = await discordClient.client.channels.fetch(channelId)
	if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
		throw new Error(`Channel ${channelId} is not a text channel`)
	}
	await channel.send(content)
}
