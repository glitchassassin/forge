import { prisma } from '.'

// Helper function to ensure a conversation exists
export async function ensureConversation(conversationId: string) {
	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
	})
	if (!conversation) {
		await prisma.conversation.create({
			data: { id: conversationId },
		})
	}
}
