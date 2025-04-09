import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from './index'

describe('Database', () => {
  let db: Database

  beforeEach(() => {
    db = new Database()
  })

  it('should add a channel and verify it exists', async () => {
    const channelId = 'test-channel-1'
    
    // Add the channel
    await db.addChannel(channelId)
    
    // Verify it exists
    expect(db.channelExists(channelId)).toBe(true)
  })

  it('should not add duplicate channels', async () => {
    const channelId = 'test-channel-2'
    
    // Add the channel twice
    await db.addChannel(channelId)
    await db.addChannel(channelId)
    
    // Verify it was only added once
    const channels = db.getChannels()
    expect(channels).toHaveLength(1)
    expect(channels[0]).toBe(channelId)
  })

  it('should return all monitored channels', async () => {
    const channels = ['channel-1', 'channel-2', 'channel-3']
    
    // Add multiple channels
    for (const channelId of channels) {
      await db.addChannel(channelId)
    }
    
    // Verify all channels are returned
    const monitoredChannels = db.getChannels()
    expect(monitoredChannels).toHaveLength(channels.length)
    expect(monitoredChannels).toEqual(expect.arrayContaining(channels))
  })

  it('should return false for non-existent channels', () => {
    expect(db.channelExists('non-existent-channel')).toBe(false)
  })
}) 