import { tool } from 'ai'
import { Chrono } from 'chrono-node'
import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'
import { prisma } from '../db'

export function scheduler({ conversationId }: { conversationId: string }) {
	return {
		scheduleMessage: tool({
			description:
				'Schedule a message to be sent at a specific time or on a recurring schedule',
			parameters: z.object({
				message: z
					.string()
					.describe(
						'An imperative command to remind you to do something, e.g. "remind <@123456> to take out the trash"',
					),
				time: z
					.string()
					.optional()
					.describe(
						'When to send the message (e.g. "in 5 minutes", "tomorrow at 3pm")',
					),
				cron: z
					.string()
					.optional()
					.describe(
						'A cron expression to schedule a recurring message (e.g. "0 9 * * *" for every day at 9am)',
					),
			}),
			execute: async ({ message, time, cron }) => {
				const parsedTime = time ? new Chrono().parseDate(time) : undefined
				if (!parsedTime) {
					throw new Error('Could not parse the specified time')
				}

				try {
					if (cron) {
						CronExpressionParser.parse(cron, { tz: 'UTC' })
					}
				} catch {
					throw new Error('Invalid cron expression')
				}

				const scheduledMessage = await prisma.scheduledMessage.create({
					data: {
						conversationId,
						message,
						nextTrigger: parsedTime,
						cron,
					},
				})

				return { id: scheduledMessage.id }
			},
		}),

		listScheduledMessages: tool({
			description: 'List all scheduled messages for a conversation',
			parameters: z.object({}),
			execute: async ({}) => {
				const messages = await prisma.scheduledMessage.findMany({
					where: { conversationId },
					orderBy: { nextTrigger: 'asc' },
				})

				return messages.map((msg) => ({
					id: msg.id,
					message: msg.message,
					nextTrigger: msg.nextTrigger,
					cron: msg.cron,
				}))
			},
		}),

		updateScheduledMessage: tool({
			description: 'Update a scheduled message',
			parameters: z.object({
				id: z.string(),
				message: z
					.string()
					.describe(
						'An imperative command to remind you to do something, e.g. "remind <@123456> to take out the trash"',
					),
				time: z
					.string()
					.optional()
					.describe(
						'When to send the message (e.g. "in 5 minutes", "tomorrow at 3pm")',
					),
				cron: z
					.string()
					.optional()
					.describe(
						'A cron expression to schedule a recurring message (e.g. "0 9 * * *" for every day at 9am)',
					),
			}),
			execute: async ({ id, message, time, cron }) => {
				const updateData: any = {}

				if (message) {
					updateData.message = message
				}

				if (time) {
					const parsedTime = new Chrono().parseDate(time)
					if (!parsedTime) {
						throw new Error('Could not parse the specified time')
					}
					updateData.nextTrigger = parsedTime
				}

				if (cron) {
					try {
						CronExpressionParser.parse(cron, { tz: 'UTC' })
						updateData.cron = cron
					} catch {
						throw new Error('Invalid cron expression')
					}
				}

				const updated = await prisma.scheduledMessage.update({
					where: { id },
					data: updateData,
				})

				return { id: updated.id }
			},
		}),

		deleteScheduledMessage: tool({
			description: 'Delete a scheduled message',
			parameters: z.object({
				id: z.string(),
			}),
			execute: async ({ id }) => {
				await prisma.scheduledMessage.delete({
					where: { id },
				})
				return { success: true }
			},
		}),
	}
}

export async function runScheduledMessages() {
	const now = new Date()

	// Find messages that should be triggered
	const messages = await prisma.scheduledMessage.findMany({
		where: {
			nextTrigger: {
				lte: now,
			},
		},
	})

	for (const msg of messages) {
		// Create the message in the Message table
		await prisma.message.create({
			data: {
				conversationId: msg.conversationId,
				role: 'user',
				content: `<scheduled_message id="${msg.id}">${msg.message}</scheduled_message>`,
			},
		})

		if (msg.cron) {
			// If it's a recurring message, calculate the next trigger time
			const interval = CronExpressionParser.parse(msg.cron, { tz: 'UTC' })
			const nextTrigger = interval.next().toDate()

			// Update the next trigger time
			await prisma.scheduledMessage.update({
				where: { id: msg.id },
				data: { nextTrigger },
			})
		} else {
			// If it's a one-time message, delete it
			await prisma.scheduledMessage.delete({
				where: { id: msg.id },
			})
		}
	}
}
