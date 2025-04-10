import { tool } from 'ai'
import * as chrono from 'chrono-node'
import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'
import {
	createScheduledEvent,
	deleteScheduledEvent,
	getDueScheduledEvents,
	getScheduledEventsForChannel,
	updateScheduledEvent,
} from '../core/database'
import { type EventQueue } from '../core/event-queue'
import { type Event } from '../types/events'

// Schema for validating schedule patterns
const SchedulePatternSchema = z
	.string()
	.optional()
	.refine(
		(pattern) => {
			if (!pattern) return true // Allow empty pattern for natural language dates
			try {
				CronExpressionParser.parse(pattern)
				return true
			} catch {
				return false
			}
		},
		{
			message: 'Must be a valid cron expression',
		},
	)

// Schema for validating time offsets
const TimeOffsetSchema = z
	.string()
	.optional()
	.refine(
		(timeOffset) => {
			if (!timeOffset) return true
			const result = chrono.parseDate(timeOffset)
			return result !== null
		},
		{
			message: 'Must be a valid natural language time expression',
		},
	)

export type SchedulePattern = z.infer<typeof SchedulePatternSchema>
export type TimeOffset = z.infer<typeof TimeOffsetSchema>

/**
 * Calculates the next trigger time for a given schedule pattern
 * @param pattern The schedule pattern (cron expression)
 * @param fromTime Optional timestamp to calculate from (defaults to now)
 * @returns The next trigger time as a Unix timestamp in milliseconds
 */
export function calculateNextTriggerTime(
	pattern: string,
	fromTime: number = Date.now(),
): number {
	const interval = CronExpressionParser.parse(pattern, {
		currentDate: new Date(fromTime),
	})
	return interval.next().getTime()
}

/**
 * Validates a schedule pattern
 * @param pattern The schedule pattern to validate
 * @returns true if valid, false otherwise
 */
export function isValidSchedulePattern(pattern: string): boolean {
	try {
		SchedulePatternSchema.parse(pattern)
		return true
	} catch {
		return false
	}
}

/**
 * Checks if a schedule pattern is a valid cron expression
 * @param pattern The schedule pattern to check
 * @returns true if the pattern is a valid cron expression, false otherwise
 */
function isValidCronExpression(pattern: string): boolean {
	try {
		CronExpressionParser.parse(pattern)
		return Boolean(pattern)
	} catch {}

	return false
}

/**
 * Creates a new scheduled event in the database
 * @param pattern The schedule pattern (optional)
 * @param timeOffset The natural language time offset (optional)
 * @param prompt The prompt to be sent
 * @param channelId The Discord channel ID to send the event to
 * @returns The ID of the created event
 */
export async function scheduleEvent(
	pattern: SchedulePattern,
	timeOffset: TimeOffset,
	prompt: string,
	channelId: string,
): Promise<string> {
	let nextTriggerAt: number

	if (timeOffset) {
		// Parse natural language time offset
		console.log('Parsing time offset:', {
			input: timeOffset,
			currentTime: new Date().toISOString(),
		})
		const result = chrono.parseDate(timeOffset)
		if (!result) {
			throw new Error('Invalid time offset')
		}
		nextTriggerAt = result.getTime()
		console.log('Parsed time offset:', {
			input: timeOffset,
			result: new Date(nextTriggerAt).toISOString(),
			milliseconds: nextTriggerAt,
		})
	} else if (pattern) {
		// Parse cron expression
		console.log('Calculating next trigger time for cron pattern:', {
			pattern,
			currentTime: new Date().toISOString(),
		})
		nextTriggerAt = calculateNextTriggerTime(pattern)
		console.log('Calculated next trigger time:', {
			pattern,
			result: new Date(nextTriggerAt).toISOString(),
			milliseconds: nextTriggerAt,
		})
	} else {
		throw new Error('Either pattern or timeOffset must be provided')
	}

	return createScheduledEvent(
		pattern || null,
		prompt,
		channelId,
		new Date(nextTriggerAt),
	)
}

/**
 * Updates a scheduled event after it has been triggered
 * @param eventId The ID of the event to update
 * @param pattern The schedule pattern (needed to calculate next trigger time)
 */
export async function updateScheduledEventAfterTrigger(
	eventId: string,
	pattern: SchedulePattern,
): Promise<void> {
	if (!pattern) {
		return deleteScheduledEvent(eventId)
	}
	const nextTriggerAt = calculateNextTriggerTime(pattern)
	return updateScheduledEvent(eventId, new Date(nextTriggerAt))
}

/**
 * Checks for due scheduled events and publishes them to the event queue
 * @param eventQueue The event queue instance
 */
export async function checkAndPublishScheduledEvents(
	eventQueue: EventQueue,
): Promise<void> {
	try {
		const dueEvents = await getDueScheduledEvents()

		for (const event of dueEvents) {
			try {
				// Create the event message
				const eventMessage: Event = {
					type: 'scheduled',
					channel: event.channelId,
					messages: [
						{
							role: 'user',
							content: `Do this previously scheduled event now: \n\n${event.prompt}`,
						},
					],
				}

				// Add to event queue
				eventQueue.add(eventMessage)

				await updateScheduledEventAfterTrigger(
					event.id,
					event.schedulePattern || undefined,
				)
			} catch (error) {
				console.error('Error processing scheduled event:', {
					eventId: event.id,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})
			}
		}
	} catch (error) {
		console.error('Error in checkAndPublishScheduledEvents:', {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
		})
	}
}

export const scheduleTools = (channelId: string) => ({
	create: tool({
		description: `Create a new scheduled event that will trigger at a specific time or on a recurring schedule.
		
		This tool allows you to schedule future actions, such as:
		- Reminding yourself to follow up with a user
		- Scheduling periodic status updates
		- Setting up recurring tasks or checks
		- Planning future tool executions
		
		You can specify the time in one of two ways:
		1. As a cron expression for recurring events (e.g., "0 9 * * *" for daily at 9 AM)
		2. As a natural language time offset (e.g., "in 5 minutes", "tomorrow at 3pm", "next monday")
		
		The prompt should be written to tell you what to do when the event triggers, with as much detail as you will need.
		For example:
		- "Say '<@1234567890> It's time to follow up with John Smith.'"
		- "Say 'What are today's priorities?'"
		- "Check for new GitHub issues in the last 24 hours and summarize them."`,
		parameters: z.object({
			pattern: SchedulePatternSchema,
			timeOffset: TimeOffsetSchema,
			prompt: z.string().min(1),
		}),
		execute: async ({ pattern, timeOffset, prompt }) => {
			try {
				if (!pattern && !timeOffset) {
					throw new Error('Either pattern or timeOffset must be provided')
				}
				const id = await scheduleEvent(pattern, timeOffset, prompt, channelId)
				return { id, message: 'Scheduled event created successfully' }
			} catch (error) {
				console.error('Error creating scheduled event:', {
					pattern,
					timeOffset,
					channelId,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})
				throw error
			}
		},
	}),

	list: tool({
		description: 'List all scheduled events for the current channel',
		parameters: z.object({}),
		execute: async () => {
			const events = await getScheduledEventsForChannel(channelId)
			if (events.length === 0) {
				return { message: 'No scheduled events found for this channel' }
			}

			const eventList = events.map((event) => {
				const nextTrigger = new Date(event.nextTriggerAt).toLocaleString()
				const pattern = event.schedulePattern
					? `\nSchedule: ${event.schedulePattern}`
					: ''
				return `ID: ${event.id}\nNext trigger: ${nextTrigger}${pattern}\nPrompt: ${event.prompt}\n`
			})

			return {
				message: `Scheduled events for this channel:\n\n${eventList.join('\n')}`,
			}
		},
	}),

	delete: tool({
		description: `Delete a scheduled event that you no longer need.
		
		Use this when:
		- A task has been completed
		- A reminder is no longer needed
		- You want to cancel a future action
		
		You'll need the event ID from the list command to delete it.`,
		parameters: z.object({
			id: z.string().min(1),
		}),
		execute: async ({ id }) => {
			try {
				await deleteScheduledEvent(id)
				return { message: 'Scheduled event deleted successfully' }
			} catch (error) {
				console.error('Error deleting scheduled event:', {
					id,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})
				throw error
			}
		},
	}),
})
