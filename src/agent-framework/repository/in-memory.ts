import { Repository } from './index'

type StoredItem<T> = {
	primaryKey: string
	secondaryKey: string
	item: T
}

export class InMemoryRepository<T> extends Repository<T> {
	private storage: Map<string, StoredItem<T>> = new Map()

	async create({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey: string
		item: T
	}): Promise<{ primaryKey: string; secondaryKey: string; item: T }> {
		const storedItem = { primaryKey, secondaryKey, item }
		this.storage.set(primaryKey, storedItem)
		return storedItem
	}

	async readById({
		primaryKey,
	}: {
		primaryKey: string
	}): Promise<
		{ primaryKey: string; secondaryKey: string; item: T } | undefined
	> {
		return this.storage.get(primaryKey)
	}

	async read({
		secondaryKey,
		limit,
		offset = 0,
	}: {
		secondaryKey: string
		limit?: number
		offset?: number
	}): Promise<{ primaryKey: string; secondaryKey: string; item: T }[]> {
		let items = Array.from(this.storage.values())
			.filter((item) => item.secondaryKey === secondaryKey)
			.slice(offset, limit ? offset + limit : undefined)

		return items
	}

	async update({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey: string
		item: T
	}): Promise<{ primaryKey: string; secondaryKey: string; item: T }> {
		const storedItem = { primaryKey, secondaryKey, item }
		this.storage.set(primaryKey, storedItem)
		return storedItem
	}

	async delete({
		primaryKey,
	}: {
		primaryKey: string
	}): Promise<{ primaryKey: string }> {
		this.storage.delete(primaryKey)
		return { primaryKey }
	}
}
