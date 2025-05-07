import { type Prisma } from '@prisma/client'
import { tool } from 'ai'
import { Chrono } from 'chrono-node'
import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'
import { prisma } from '../db'

export function scheduler({ conversationId }: { conversationId: string }) {
	return {
		scheduleMessage: tool({
			description: `Schedule a message to be sent to you at a specific time or on a recurring schedule.
                The message will be wrapped in a <scheduled_message> tag so you know it's a reminder,
                not from the user directly. Address messages to yourself and describe what you should
                do when the reminder triggers.`,
			parameters: z
				.object({
					message: z
						.string()
						.describe(
							'An imperative command to remind you to do something, e.g. "remind <@123456> to take out the trash"',
						),
					time: z
						.string()
						.optional()
						.describe(
							'When to send the message (e.g. "in 5 minutes", "tomorrow at 3pm"). If not specified, it will be derived from the cron expression.',
						)
						.refine(
							(time) => {
								if (!time) return true
								const parsedTime = new Chrono().parseDate(time)
								return parsedTime !== null
							},
							{ message: 'Could not parse the specified time' },
						)
						.transform((time) =>
							time ? new Chrono().parseDate(time) : undefined,
						),
					cron: z
						.string()
						.optional()
						.describe(
							'A cron expression to schedule a recurring message (e.g. "0 9 * * *" for every day at 9am)',
						)
						.refine(
							(cron) => {
								if (!cron) return true
								try {
									CronExpressionParser.parse(cron, { tz: 'UTC' })
									return true
								} catch {
									return false
								}
							},
							{ message: 'Invalid cron expression' },
						),
				})
				.refine(
					(data) => {
						if (!data.time && !data.cron) {
							return false
						}
						return true
					},
					{ message: 'Must provide either time or cron' },
				),
			execute: async ({ message, time, cron }) => {
				const data: Prisma.ScheduledMessageCreateInput = {
					conversationId,
					message,
					// Schema enforces that either time or cron is set
					nextTrigger:
						time ??
						CronExpressionParser.parse(cron!, { tz: 'UTC' }).next().toDate(),
					cron,
				}

				const scheduledMessage = await prisma.scheduledMessage.create({
					data,
				})

				return { id: scheduledMessage.id }
			},
		}),

		listScheduledMessages: tool({
			description: 'List all scheduled messages for the current conversation',
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
			description: `Update a scheduled message to be sent to you at a specific time or on a 
                recurring schedule. The message will be wrapped in a <scheduled_message> tag so you 
                know it's a reminder, not from the user directly. Address messages to yourself and 
                describe what you should do when the reminder triggers.`,
			parameters: z
				.object({
					id: z.string(),
					message: z
						.string()
						.optional()
						.describe(
							'An imperative command to remind you to do something, e.g. "remind <@123456> to take out the trash"',
						),
					time: z
						.string()
						.optional()
						.describe(
							'When to send the message (e.g. "in 5 minutes", "tomorrow at 3pm"). If not specified, it will be derived from the cron expression.',
						)
						.refine(
							(time) => {
								if (!time) return true
								const parsedTime = new Chrono().parseDate(time)
								return parsedTime !== null
							},
							{ message: 'Could not parse the specified time' },
						)
						.transform((time) =>
							time ? new Chrono().parseDate(time) : undefined,
						),
					cron: z
						.string()
						.optional()
						.describe(
							'A cron expression to schedule a recurring message (e.g. "0 9 * * *" for every day at 9am)',
						)
						.refine(
							(cron) => {
								if (!cron) return true
								try {
									CronExpressionParser.parse(cron, { tz: 'UTC' })
									return true
								} catch {
									return false
								}
							},
							{ message: 'Invalid cron expression' },
						),
				})
				.refine(
					(data) => {
						if (!data.message && !data.time && !data.cron) {
							return false
						}
						return true
					},
					{ message: 'Must provide at least one field to update' },
				),
			execute: async ({ id, message, time, cron }) => {
				const updateData: Prisma.ScheduledMessageUpdateInput = {}

				if (message) {
					updateData.message = message
				}

				if (cron) {
					updateData.cron = cron
					updateData.nextTrigger = CronExpressionParser.parse(cron, {
						tz: 'UTC',
					})
						.next()
						.toDate()
				}

				if (time) {
					// overrides cron nextTrigger, if specified
					updateData.nextTrigger = time
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
