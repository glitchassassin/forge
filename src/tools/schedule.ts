import { tool } from 'ai'
import * as chrono from 'chrono-node'
import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'
import { Database } from '../core/database'
import { EventQueue } from '../core/event-queue'
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
 * @param db The database instance
 * @param pattern The schedule pattern (optional)
 * @param timeOffset The natural language time offset (optional)
 * @param prompt The prompt to be sent
 * @param channelId The Discord channel ID to send the event to
 * @returns The ID of the created event
 */
export async function createScheduledEvent(
	db: Database,
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

	return db.createScheduledEvent(
		pattern || null,
		prompt,
		channelId,
		nextTriggerAt,
	)
}

/**
 * Updates a scheduled event after it has been triggered
 * @param db The database instance
 * @param eventId The ID of the event to update
 * @param pattern The schedule pattern (needed to calculate next trigger time)
 */
export async function updateScheduledEvent(
	db: Database,
	eventId: string,
	pattern: SchedulePattern,
): Promise<void> {
	if (!pattern) {
		return db.deleteScheduledEvent(eventId)
	}
	const nextTriggerAt = calculateNextTriggerTime(pattern)
	return db.updateScheduledEvent(eventId, nextTriggerAt)
}

/**
 * Checks for due scheduled events and publishes them to the event queue
 * @param db The database instance
 * @param eventQueue The event queue instance
 */
export async function checkAndPublishScheduledEvents(
	db: Database,
	eventQueue: EventQueue,
): Promise<void> {
	try {
		const dueEvents = db.getDueScheduledEvents()

		for (const event of dueEvents) {
			try {
				// Create the event message
				const eventMessage: Event = {
					type: 'scheduled',
					channel: event.channelId,
					messages: [
						{
							role: 'system',
							content: event.prompt,
						},
					],
				}

				// Add to event queue
				eventQueue.add(eventMessage)

				await updateScheduledEvent(db, event.id, event.pattern)
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

export const scheduleTools = (db: Database, channelId: string) => ({
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
		- "Remind the user to follow up with John Smith"
		- "Ask the user what today's priorities are"
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
				const id = await createScheduledEvent(
					db,
					pattern,
					timeOffset,
					prompt,
					channelId,
				)
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
		description: `List all scheduled events that you have created.
		
		This will show you:
		- The event ID
		- The schedule pattern
		- The prompt that will be executed
		- The channel where it will be sent
		- When it will next trigger
		
		Use this to review and manage your scheduled tasks.`,
		parameters: z.object({}),
		execute: async () => {
			try {
				const events = db.getDueScheduledEvents()
				return events
			} catch (error) {
				console.error('Error listing scheduled events:', {
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})
				throw error
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
				await db.deleteScheduledEvent(id)
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
