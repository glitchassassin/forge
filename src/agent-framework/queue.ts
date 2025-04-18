import { Persistence } from './persistence'
import { Message } from './types'

export class MessageQueue {
	private listeners: {
		[key in Message['type']]: ((
			message: Message & { type: key },
		) => Promise<void>)[]
	} = {
		agent: [],
		'approval-response': [],
		'tool-call': [],
	}

	private nextAction: Promise<void> = Promise.resolve()
	private persistence: Persistence
	constructor({ persistence }: { persistence: Persistence }) {
		this.persistence = persistence

		this.persistence.getMessages().then((messages) => {
			for (const message of messages) {
				this.nextAction = this.nextAction.then(() =>
					this.processMessage(message),
				)
			}
		})
	}

	send(message: Message) {
		this.persistence.addMessage(message)
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
	}
}
