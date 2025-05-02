import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../db'
import { scheduler, runScheduledMessages } from './scheduler'

describe('Scheduler Tools', () => {
	const conversationId = 'test-conversation'
	const schedulerTools = scheduler({ conversationId })
	const toolOptions = {
		toolCallId: 'test-tool-call',
		messages: [],
	}
	beforeEach(async () => {
		await prisma.conversation.create({
			data: {
				id: conversationId,
			},
		})
	})

	it('should schedule a one-time message', async () => {
		const result = await schedulerTools.scheduleMessage.execute(
			{
				message: 'Test reminder',
				time: new Date(),
			},
			toolOptions,
		)

		expect(result.id).toBeDefined()

		const scheduledMessage = await prisma.scheduledMessage.findUnique({
			where: { id: result.id },
		})

		expect(scheduledMessage).toBeDefined()
		expect(scheduledMessage?.message).toBe('Test reminder')
		expect(scheduledMessage?.conversationId).toBe(conversationId)
		expect(scheduledMessage?.cron).toBeNull()
	})

	it('should schedule a recurring message with cron', async () => {
		const result = await schedulerTools.scheduleMessage.execute(
			{
				message: 'Daily reminder',
				cron: '0 9 * * *', // Every day at 9am
			},
			toolOptions,
		)

		expect(result.id).toBeDefined()

		const scheduledMessage = await prisma.scheduledMessage.findUnique({
			where: { id: result.id },
		})

		expect(scheduledMessage).toBeDefined()
		expect(scheduledMessage?.message).toBe('Daily reminder')
		expect(scheduledMessage?.cron).toBe('0 9 * * *')
	})

	it('should list scheduled messages', async () => {
		// Create a test message
		await schedulerTools.scheduleMessage.execute(
			{
				message: 'List test message',
				time: new Date(),
			},
			toolOptions,
		)

		const messages = await schedulerTools.listScheduledMessages.execute(
			{},
			toolOptions,
		)

		expect(messages).toBeInstanceOf(Array)
		expect(messages.length).toBeGreaterThan(0)
		expect(messages[0]).toHaveProperty('id')
		expect(messages[0]).toHaveProperty('message')
		expect(messages[0]).toHaveProperty('nextTrigger')
	})

	it('should update a scheduled message', async () => {
		// Create initial message
		const initial = await schedulerTools.scheduleMessage.execute(
			{
				message: 'Initial message',
				time: new Date(),
			},
			toolOptions,
		)

		// Update the message
		const updated = await schedulerTools.updateScheduledMessage.execute(
			{
				id: initial.id,
				message: 'Updated message',
				time: new Date(),
			},
			toolOptions,
		)

		expect(updated.id).toBe(initial.id)

		const scheduledMessage = await prisma.scheduledMessage.findUnique({
			where: { id: initial.id },
		})

		expect(scheduledMessage?.message).toBe('Updated message')
	})

	it('should delete a scheduled message', async () => {
		// Create a message to delete
		const toDelete = await schedulerTools.scheduleMessage.execute(
			{
				message: 'To be deleted',
				time: new Date(),
			},
			toolOptions,
		)

		// Delete the message
		await schedulerTools.deleteScheduledMessage.execute(
			{ id: toDelete.id },
			toolOptions,
		)

		const deleted = await prisma.scheduledMessage.findUnique({
			where: { id: toDelete.id },
		})

		expect(deleted).toBeNull()
	})

	it('should process scheduled messages and create new messages', async () => {
		// Create a message that should trigger immediately
		const now = new Date()
		await prisma.scheduledMessage.create({
			data: {
				conversationId,
				message: 'Test scheduled message',
				nextTrigger: now,
			},
		})

		// Run the scheduler
		await runScheduledMessages()

		// Check that a new message was created
		const messages = await prisma.message.findMany({
			where: { conversationId },
		})

		expect(messages).toHaveLength(1)
		expect(messages[0]?.content).toContain('Test scheduled message')
		expect(messages[0]?.content).toContain('<scheduled_message')

		// Check that the scheduled message was deleted (since it's not recurring)
		const scheduledMessages = await prisma.scheduledMessage.findMany({
			where: { conversationId },
		})
		expect(scheduledMessages).toHaveLength(0)
	})

	it('should update next trigger time for recurring messages', async () => {
		// Create a recurring message
		const now = new Date()
		const message = await prisma.scheduledMessage.create({
			data: {
				conversationId,
				message: 'Recurring test message',
				nextTrigger: now,
				cron: '0 9 * * *', // Every day at 9am
			},
		})

		// Run the scheduler
		await runScheduledMessages()

		// Check that the message was created
		const messages = await prisma.message.findMany({
			where: { conversationId },
		})
		expect(messages).toHaveLength(1)

		// Check that the scheduled message was updated with a new trigger time
		const updatedScheduled = await prisma.scheduledMessage.findUnique({
			where: { id: message.id },
		})
		expect(updatedScheduled).toBeDefined()
		expect(updatedScheduled?.nextTrigger).toBeDefined()
		if (updatedScheduled?.nextTrigger) {
			expect(updatedScheduled.nextTrigger.getTime()).toBeGreaterThan(
				now.getTime(),
			)
		}
	})
})
