import { ulid } from 'ulid'
import { type Repository } from './repository'
import { InMemoryRepository } from './repository/in-memory'
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
	public repository: Repository<Message>

	constructor({
		repository = new InMemoryRepository<Message>(),
	}: {
		repository: Repository<Message>
	}) {
		this.repository = repository
	}

	async start() {
		const messages = await this.repository.read({ secondaryKey: '' })
		for (const message of messages) {
			this.queueMessage(message.item as Message)
		}
	}

	private queueMessage(message: Message) {
		this.nextAction[message.conversation] = (
			this.nextAction[message.conversation] ?? Promise.resolve()
		)
			.then(() => this.processMessage(message))
			.catch((error) => {
				console.error(error)
				// Continue processing next event even if current one failed
				return Promise.resolve()
			})
	}

	async send(message: CreateMessage) {
		const m = {
			...message,
			id: ulid(),
		}
		await this.repository.create({
			primaryKey: m.id,
			secondaryKey: m.conversation,
			item: m,
		})
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
		await this.repository.update({
			primaryKey: message.id,
			secondaryKey: message.conversation,
			item: message,
		})
	}
}
