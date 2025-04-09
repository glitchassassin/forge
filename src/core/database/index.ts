import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class Database {
  private db: DatabaseSync

  constructor() {
    const dbPath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'discord-agent.db')
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
    return rows.map(row => row.channel_id)
  }

  channelExists(channelId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM monitored_channels WHERE channel_id = ?')
    const result = stmt.get(channelId) as { '1': number } | undefined
    return result !== undefined
  }
} 