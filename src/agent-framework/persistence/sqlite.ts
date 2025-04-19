import { PrismaClient } from '@prisma/client'
import { type CoreMessage } from 'ai'
import { type Message, type ToolCallMessage } from '../types'
import { Persistence } from './index'

export class SqlitePersistence extends Persistence {
	private prisma: PrismaClient

	constructor() {
		super()
		this.prisma = new PrismaClient()
	}

	async getMessages(conversation?: string): Promise<Message[]> {
		const messages = await this.prisma.message.findMany({
			where: {
				handled: false,
				...(conversation ? { conversation } : {}),
			},
			orderBy: {
				createdAt: 'asc',
			},
		})

		return messages.map((msg) => ({
			id: msg.id,
			type: msg.type as Message['type'],
			conversation: msg.conversation,
			body: JSON.parse(msg.body),
			handled: msg.handled,
			created_at: msg.createdAt,
		}))
	}

	async getAllMessages(): Promise<Message[]> {
		const messages = await this.prisma.message.findMany({
			orderBy: {
				createdAt: 'asc',
			},
		})

		return messages.map((msg) => ({
			id: msg.id,
			type: msg.type as Message['type'],
			conversation: msg.conversation,
			body: JSON.parse(msg.body),
			handled: msg.handled,
			created_at: msg.createdAt,
		}))
	}

	async addMessage(message: Message): Promise<void> {
		await this.prisma.message.create({
			data: {
				id: message.id,
				type: message.type,
				conversation: message.conversation,
				body: JSON.stringify(message.body),
				handled: message.handled,
			},
		})
	}

	async markAsHandled(id: Message['id']): Promise<void> {
		await this.prisma.message.update({
			where: { id },
			data: { handled: true },
		})
	}

	async getToolCall(
		toolCallId: string,
	): Promise<ToolCallMessage<string, unknown> | undefined> {
		const message = await this.prisma.message.findFirst({
			where: {
				type: 'tool-call',
				body: {
					contains: toolCallId,
				},
			},
		})

		if (!message) return undefined

		const parsedBody = JSON.parse(message.body)
		if (parsedBody.toolCall.toolCallId === toolCallId) {
			return {
				id: message.id,
				type: 'tool-call',
				conversation: message.conversation,
				body: parsedBody,
				handled: message.handled,
				created_at: message.createdAt,
			}
		}

		return undefined
	}

	async addCoreMessage(
		conversation: string,
		message: CoreMessage,
	): Promise<void> {
		await this.prisma.conversation.create({
			data: {
				channelId: conversation,
				message: JSON.stringify(message),
			},
		})
	}

	async getCoreMessages(
		conversation: string,
		limit?: number,
	): Promise<CoreMessage[]> {
		const messages = await this.prisma.conversation.findMany({
			where: {
				channelId: conversation,
			},
			orderBy: {
				createdAt: 'asc',
			},
			take: limit,
		})

		return messages.map((msg) => JSON.parse(msg.message) as CoreMessage)
	}
}
