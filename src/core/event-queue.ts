import { type Event } from '../types/events'

type EventHandler = (event: Event) => Promise<void>

export class EventQueue {
  private processingPromise: Promise<void> = Promise.resolve()
  private handler: EventHandler

  constructor(handler: EventHandler) {
    this.handler = handler
  }

  add(event: Event): void {
    this.processingPromise = this.processingPromise
      .then(() => this.handler(event))
      .catch(error => {
        console.error('Error handling event:', error)
        // Continue processing next event even if current one failed
        return Promise.resolve()
      })
  }

  // Optional: Add a way to wait for all events to be processed
  async waitForCompletion(): Promise<void> {
    await this.processingPromise
  }
} 