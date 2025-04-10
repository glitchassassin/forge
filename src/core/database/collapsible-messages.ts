import { db as prisma } from './index'

export async function createCollapsibleMessage(
	messageId: string,
	channelId: string,
	content: string,
	collapsedContent: string,
	isCollapsed: boolean = true,
) {
	return prisma.collapsibleMessage.create({
		data: {
			messageId,
			channelId,
			content,
			collapsedContent,
			isCollapsed,
		},
	})
}

export async function getCollapsibleMessage(messageId: string) {
	return prisma.collapsibleMessage.findUnique({
		where: { messageId },
	})
}

export async function toggleCollapsibleMessage(messageId: string) {
	const message = await prisma.collapsibleMessage.findUnique({
		where: { messageId },
	})

	if (!message) {
		throw new Error(`No collapsible message found with ID ${messageId}`)
	}

	return prisma.collapsibleMessage.update({
		where: { messageId },
		data: { isCollapsed: !message.isCollapsed },
	})
}
