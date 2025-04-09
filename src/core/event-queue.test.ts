import { describe, expect, it, vi } from 'vitest'
import { type Event } from '../types/events'
import { EventQueue } from './event-queue'

describe('EventQueue', () => {
  it('should process events in order', async () => {
    const handler = vi.fn()
    const queue = new EventQueue(handler)
    
    const events: Event[] = [
      {
        type: 'discord',
        channel: 'test-channel',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      {
        type: 'scheduled',
        channel: 'test-channel',
        messages: [{ role: 'system', content: 'Reminder' }],
      },
    ]

    queue.add(events[0]!)
    queue.add(events[1]!)

    await queue.waitForCompletion()

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(1, events[0])
    expect(handler).toHaveBeenNthCalledWith(2, events[1])
  })

  it('should validate events', () => {
    const handler = vi.fn()
    const queue = new EventQueue(handler)
    
    const invalidEvent = {
      type: 'invalid',
      channel: 'test-channel',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    expect(() => queue.add(invalidEvent as Event)).toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('should handle concurrent events', async () => {
    const handler = vi.fn()
    const queue = new EventQueue(handler)
    
    const event: Event = {
      type: 'discord',
      channel: 'test-channel',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    queue.add(event)
    queue.add(event)
    queue.add(event)

    await queue.waitForCompletion()

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('should handle handler errors gracefully', async () => {
    const error = new Error('Handler failed')
    const handler = vi.fn().mockRejectedValueOnce(error)
    const queue = new EventQueue(handler)
    
    const events: Event[] = [
      {
        type: 'discord',
        channel: 'test-channel',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      {
        type: 'discord',
        channel: 'test-channel',
        messages: [{ role: 'user', content: 'World' }],
      },
    ]

    queue.add(events[0]!)
    queue.add(events[1]!)

    await queue.waitForCompletion()

    expect(handler).toHaveBeenCalledTimes(2)
  })
}) 