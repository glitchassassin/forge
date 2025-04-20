import { PrismaClient } from '@prisma/client'
import { type CoreMessage } from 'ai'
import { type Repository } from './agent-framework/repository'
import { type Message } from './agent-framework/types'

const prisma = new PrismaClient()

// Export concrete implementations for each table
export class QueueRepository implements Repository<Message> {
	async create({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey: string
		item: Message
	}) {
		const record = await prisma.queue.create({
			data: {
				id: primaryKey,
				secondaryKey,
				item: JSON.stringify(item),
			},
		})

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as Message,
		}
	}

	async readById({ primaryKey }: { primaryKey: string }) {
		const record = await prisma.queue.findUnique({
			where: { id: primaryKey },
		})

		if (!record) return undefined

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as Message,
		}
	}

	async read({
		secondaryKey,
		limit,
		offset,
	}: {
		secondaryKey: string
		limit?: number
		offset?: number
	}) {
		const records = await prisma.queue.findMany({
			where: { secondaryKey },
			take: limit,
			skip: offset,
		})

		return records.map((record) => ({
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as Message,
		}))
	}

	async update({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey?: string
		item: Message
	}) {
		const record = await prisma.queue.update({
			where: { id: primaryKey },
			data: {
				...(secondaryKey && { secondaryKey }),
				item: JSON.stringify(item),
			},
		})

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as Message,
		}
	}

	async delete({ primaryKey }: { primaryKey: string }) {
		await prisma.queue.delete({
			where: { id: primaryKey },
		})

		return { primaryKey }
	}
}

export class AgentRepository implements Repository<CoreMessage> {
	async create({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey: string
		item: CoreMessage
	}) {
		const record = await prisma.agent.create({
			data: {
				id: primaryKey,
				secondaryKey,
				item: JSON.stringify(item),
			},
		})

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as CoreMessage,
		}
	}

	async readById({ primaryKey }: { primaryKey: string }) {
		const record = await prisma.agent.findUnique({
			where: { id: primaryKey },
		})

		if (!record) return undefined

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as CoreMessage,
		}
	}

	async read({
		secondaryKey,
		limit,
		offset,
	}: {
		secondaryKey: string
		limit?: number
		offset?: number
	}) {
		const records = await prisma.agent.findMany({
			where: { secondaryKey },
			take: limit,
			skip: offset,
		})

		return records.map((record) => ({
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as CoreMessage,
		}))
	}

	async update({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey?: string
		item: CoreMessage
	}) {
		const record = await prisma.agent.update({
			where: { id: primaryKey },
			data: {
				...(secondaryKey && { secondaryKey }),
				item: JSON.stringify(item),
			},
		})

		return {
			primaryKey: record.id,
			secondaryKey: record.secondaryKey,
			item: JSON.parse(record.item) as CoreMessage,
		}
	}

	async delete({ primaryKey }: { primaryKey: string }) {
		await prisma.agent.delete({
			where: { id: primaryKey },
		})

		return { primaryKey }
	}
}
