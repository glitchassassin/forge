import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, addChannel, getChannels, channelExists, clearChannelContext, disconnect } from './index'

describe('Database', () => {
	beforeEach(async () => {
		// Clear all tables before each test
		await db.monitoredChannel.deleteMany()
		await db.scheduledEvent.deleteMany()
		await db.conversationContext.deleteMany()
	})

	afterEach(async () => {
		await disconnect()
	})

	it('should add a channel and verify it exists', async () => {
		const channelId = 'test-channel-1'
		
		// Add the channel
		await addChannel(channelId)
		
		// Verify it exists
		expect(await channelExists(channelId)).toBe(true)
	})

	it('should not add duplicate channels', async () => {
		const channelId = 'test-channel-2'
		
		// Add the channel twice
		await addChannel(channelId)
		await addChannel(channelId)
		
		// Verify it was only added once
		const channels = await getChannels()
		expect(channels).toHaveLength(1)
		expect(channels[0]).toBe(channelId)
	})

	it('should return all monitored channels', async () => {
		const channels = ['channel-1', 'channel-2', 'channel-3']
		
		// Add multiple channels
		for (const channelId of channels) {
			await addChannel(channelId)
		}
		
		// Verify all channels are returned
		const monitoredChannels = await getChannels()
		expect(monitoredChannels).toHaveLength(channels.length)
		expect(monitoredChannels).toEqual(expect.arrayContaining(channels))
	})

	it('should return false for non-existent channels', async () => {
		expect(await channelExists('non-existent-channel')).toBe(false)
	})
}) 