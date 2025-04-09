import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { v4 as uuidv4 } from 'uuid'

export class Database {
	private db: DatabaseSync

	constructor() {
		const dbPath =
			process.env.DATABASE_PATH ??
			join(process.cwd(), 'data', 'discord-agent.db')
		this.db = new DatabaseSync(dbPath)
		this.db.exec('PRAGMA journal_mode = WAL') // Use Write-Ahead Logging
		this.db.exec('PRAGMA busy_timeout = 5000') // Set busy timeout to 5 seconds
		this.initialize()
	}

	private initialize(): void {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitored_channels (
        channel_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      ) STRICT
    `)

		this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_events (
        id TEXT PRIMARY KEY,
        schedule_pattern TEXT,
        prompt TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        last_triggered_at INTEGER,
        next_trigger_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES monitored_channels(channel_id)
      ) STRICT
    `)
	}

	async addChannel(channelId: string): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT INTO monitored_channels (channel_id, created_at)
      VALUES (?, ?)
      ON CONFLICT (channel_id) DO NOTHING
    `)
		stmt.run(channelId, Date.now())
	}

	getChannels(): string[] {
		const stmt = this.db.prepare('SELECT channel_id FROM monitored_channels')
		const rows = stmt.all() as { channel_id: string }[]
		return rows.map((row) => row.channel_id)
	}

	channelExists(channelId: string): boolean {
		const stmt = this.db.prepare(
			'SELECT 1 FROM monitored_channels WHERE channel_id = ?',
		)
		const result = stmt.get(channelId) as { '1': number } | undefined
		return result !== undefined
	}

	async createScheduledEvent(
		schedulePattern: string | null,
		prompt: string,
		channelId: string,
		nextTriggerAt: number,
	): Promise<string> {
		const id = uuidv4()
		const stmt = this.db.prepare(`
      INSERT INTO scheduled_events (id, schedule_pattern, prompt, channel_id, next_trigger_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
		stmt.run(id, schedulePattern, prompt, channelId, nextTriggerAt, Date.now())
		return id
	}

	async updateScheduledEvent(
		eventId: string,
		nextTriggerAt: number,
	): Promise<void> {
		const stmt = this.db.prepare(`
      UPDATE scheduled_events
      SET last_triggered_at = ?,
          next_trigger_at = ?
      WHERE id = ?
    `)
		stmt.run(Date.now(), nextTriggerAt, eventId)
	}

	getDueScheduledEvents(): Array<{
		id: string
		prompt: string
		pattern: string
		channelId: string
	}> {
		const stmt = this.db.prepare(`
      SELECT id, prompt, schedule_pattern as pattern, channel_id as channelId
      FROM scheduled_events
      WHERE next_trigger_at <= ?
    `)
		const events = stmt.all(Date.now()) as Array<{
			id: string
			prompt: string
			pattern: string
			channelId: string
		}>
		return events
	}

	async deleteScheduledEvent(eventId: string): Promise<void> {
		const stmt = this.db.prepare('DELETE FROM scheduled_events WHERE id = ?')
		const result = stmt.run(eventId)
		if (result.changes === 0) {
			throw new Error('Scheduled event not found')
		}
	}
}
