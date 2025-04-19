import { randomUUID } from 'node:crypto'
import { type Persistence } from './persistence'
import { type CreateMessage, type Message } from './types'

export class MessageQueue {
	private listeners: {
		[key in Message['type']]: ((
			message: Message & { type: key },
		) => Promise<void>)[]
	} = {
		agent: [],
		'approval-response': [],
		'tool-call': [],
		error: [],
	}

	private nextAction: Record<string, Promise<void>> = {}
	public persistence: Persistence
	constructor({ persistence }: { persistence: Persistence }) {
		this.persistence = persistence
	}

	async start() {
		const messages = await this.persistence.getMessages()
		for (const message of messages) {
			this.queueMessage(message)
		}
	}

	private queueMessage(message: Message) {
		this.nextAction[message.conversation] = (
			this.nextAction[message.conversation] ?? Promise.resolve()
		)
			.then(() => this.processMessage(message))
			.catch((error) => {
				// Continue processing next event even if current one failed
				return Promise.resolve()
			})
	}

	async send(message: CreateMessage) {
		const m = {
			...message,
			id: randomUUID(),
			handled: false,
			created_at: new Date(),
		}
		await this.persistence.addMessage(m)
		this.queueMessage(m)
	}

	on<T extends Message['type']>(
		event: T,
		callback: (message: Message & { type: T }) => Promise<void>,
	) {
		this.listeners[event].push(callback)
	}

	private async processMessage<T extends Message['type']>(
		message: Message & { type: T },
	) {
		for (const listener of this.listeners[message.type]) {
			await listener(message)
		}
		await this.persistence.markAsHandled(message.id)
	}
}
