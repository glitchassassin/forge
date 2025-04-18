import { EventEmitter } from 'events'

export class TypedEventEmitter<
	T extends Record<string | symbol, unknown[]>,
> extends EventEmitter {
	on<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): this {
		return super.on(eventName as string | symbol, listener)
	}

	emit<K extends keyof T>(eventName: K, ...args: T[K]): boolean {
		return super.emit(eventName as string | symbol, ...args)
	}
}
