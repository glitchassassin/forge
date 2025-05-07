import { type ToolContent } from 'ai'
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
} from 'discord.js'
import { prisma } from '../../db'
import { discordClient } from '../client'

const APPROVE = 'tool-approve'
const REJECT = 'tool-reject'

export const requestApproval = async (
	channelId: string,
	content: string,
	toolCallId: string,
): Promise<void> => {
	const channel = await discordClient.client.channels.fetch(channelId)
	if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
		throw new Error(`Channel ${channelId} is not a text channel`)
	}

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${APPROVE}|${toolCallId}`)
			.setLabel('Approve')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(`${REJECT}|${toolCallId}`)
			.setLabel('Reject')
			.setStyle(ButtonStyle.Danger),
	)

	await channel.send({
		content,
		components: [row],
	})
}

// Set up button interaction handler
discordClient.client.on('interactionCreate', async (interaction) => {
	if (!interaction.isButton()) return

	const [action, toolCallId] = interaction.customId.split('|')
	if (!action || !toolCallId) return

	// Remove the buttons after response
	await interaction.update({
		components: [],
		content: '_Running tool..._',
	})

	const toolCall = await prisma.toolCall.findUnique({
		where: { id: toolCallId },
		include: { message: true },
	})

	if (!toolCall) {
		await interaction.followUp({
			content: 'Error: Tool call not found',
			ephemeral: true,
		})
		return
	}

	if (action === APPROVE) {
		// Update tool call status to approved
		await prisma.toolCall.update({
			where: { id: toolCallId },
			data: { approvedAt: new Date() },
		})
	} else {
		// Create tool result message for rejection
		await prisma.message.create({
			data: {
				conversationId: toolCall.message.conversationId,
				role: 'tool',
				content: JSON.stringify([
					{
						type: 'tool-result',
						toolCallId,
						toolName: toolCall.toolName,
						result: 'Error: Tool call was rejected by the user',
					},
				] satisfies ToolContent),
			},
		})

		// Update tool call status to finished with error
		await prisma.toolCall.update({
			where: { id: toolCallId },
			data: {
				finishedAt: new Date(),
				status: 'finished',
				error: 'Tool call was rejected by the user',
			},
		})
	}
})
