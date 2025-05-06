import { ChannelType, Guild } from 'discord.js'

export const findNextChannelNumber = async (guild: Guild): Promise<number> => {
	const channels = await guild.channels.fetch()
	const forgeChannels = channels.filter(
		(channel) =>
			channel?.name.startsWith('forge-') &&
			channel.type === ChannelType.GuildText,
	)

	const numbers = forgeChannels.map((channel) => {
		const match = channel?.name?.match(/forge-(\d+)/)
		return match?.[1] ? parseInt(match[1]) : 0
	})

	let nextNumber = 1
	while (numbers.includes(nextNumber)) {
		nextNumber++
	}

	return nextNumber
}

export const findOrCreateForgeChannel = async (
	guild: Guild,
	channelName: string,
): Promise<string> => {
	const channels = await guild.channels.fetch()
	let channel = channels.find(
		(channel): channel is NonNullable<typeof channel> =>
			channel?.name === channelName && channel.type === ChannelType.GuildText,
	)

	if (!channel) {
		// Find or create the forge category
		let forgeCategory = channels.find(
			(channel): channel is NonNullable<typeof channel> =>
				channel?.type === ChannelType.GuildCategory &&
				channel.name.toLowerCase() === 'forge',
		)

		if (!forgeCategory) {
			forgeCategory = await guild.channels.create({
				name: 'forge',
				type: ChannelType.GuildCategory,
			})
		}

		channel = await guild.channels.create({
			name: channelName,
			type: ChannelType.GuildText,
			parent: forgeCategory.id,
		})
	}

	return channel.id
}
