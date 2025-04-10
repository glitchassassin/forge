import { PrismaClient } from '@prisma/client'
import { type CoreMessage } from 'ai'

export const db = new PrismaClient()

export async function addChannel(channelId: string): Promise<void> {
	await db.monitoredChannel.upsert({
		where: { channelId },
		update: {},
		create: { channelId },
	})
}

export async function getChannels(): Promise<string[]> {
	const channels = await db.monitoredChannel.findMany({
		select: { channelId: true },
	})
	return channels.map((channel) => channel.channelId)
}

export async function channelExists(channelId: string): Promise<boolean> {
	const channel = await db.monitoredChannel.findUnique({
		where: { channelId },
	})
	return channel !== null
}

export async function createScheduledEvent(
	schedulePattern: string | null,
	prompt: string,
	channelId: string,
	nextTriggerAt: Date,
): Promise<string> {
	const event = await db.scheduledEvent.create({
		data: {
			schedulePattern,
			prompt,
			channelId,
			nextTriggerAt,
		},
	})
	return event.id
}

export async function updateScheduledEvent(
	eventId: string,
	nextTriggerAt: Date,
): Promise<void> {
	await db.scheduledEvent.update({
		where: { id: eventId },
		data: {
			lastTriggeredAt: new Date(),
			nextTriggerAt,
		},
	})
}

export async function getDueScheduledEvents(): Promise<
	Array<{
		id: string
		prompt: string
		schedulePattern: string | null
		channelId: string
	}>
> {
	return await db.scheduledEvent.findMany({
		where: {
			nextTriggerAt: {
				lte: new Date(),
			},
		},
		select: {
			id: true,
			prompt: true,
			schedulePattern: true,
			channelId: true,
		},
	})
}

export async function deleteScheduledEvent(eventId: string): Promise<void> {
	await db.scheduledEvent.delete({
		where: { id: eventId },
	})
}

export async function addMessageToContext(
	channelId: string,
	message: CoreMessage,
): Promise<void> {
	await db.conversationContext.create({
		data: {
			channelId,
			message: JSON.stringify(message),
		},
	})
}

export async function getChannelContext(
	channelId: string,
	limit: number = 100,
): Promise<CoreMessage[]> {
	const messages = await db.conversationContext.findMany({
		where: { channelId },
		orderBy: { createdAt: 'asc' },
		take: limit,
		select: { message: true },
	})
	return messages.map((msg) => JSON.parse(msg.message))
}

export async function clearChannelContext(channelId: string): Promise<void> {
	await db.conversationContext.deleteMany({
		where: { channelId },
	})
}

export async function disconnect(): Promise<void> {
	await db.$disconnect()
}

export async function getScheduledEventsForChannel(channelId: string): Promise<
	Array<{
		id: string
		prompt: string
		schedulePattern: string | null
		nextTriggerAt: Date
	}>
> {
	return await db.scheduledEvent.findMany({
		where: {
			channelId,
		},
		select: {
			id: true,
			prompt: true,
			schedulePattern: true,
			nextTriggerAt: true,
		},
		orderBy: {
			nextTriggerAt: 'asc',
		},
	})
}
