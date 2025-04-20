export type CreateResult<T> = {
	primaryKey: string
	secondaryKey: string
	item: T
}
export type ReadResult<T> = {
	primaryKey: string
	secondaryKey: string
	item: T
}
export type UpdateResult<T> = {
	primaryKey: string
	secondaryKey: string
	item: T
}
export type DeleteResult = { primaryKey: string }

/**
 * An abstract class for persisting agent data. This is used for both
 * agent context and the queue.
 *
 * `primaryKey`: unique, 26-character ULID string
 * `secondaryKey`: not unique, 255-character string
 * `item`: JSON-serializable object
 */
export abstract class Repository<T> {
	/**
	 * Create a new item in the database.
	 */
	abstract create({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey: string
		item: T
	}): Promise<CreateResult<T>>

	/**
	 * Query for a specific item in the database.
	 */
	abstract readById({
		primaryKey,
	}: {
		primaryKey: string
	}): Promise<ReadResult<T> | undefined>

	/**
	 * Query for multiple items in the database that match the secondary key.
	 */
	abstract read({
		secondaryKey,
		limit,
		offset,
	}: {
		secondaryKey: string
		limit?: number
		offset?: number
	}): Promise<ReadResult<T>[]>

	/**
	 * Update an item in the database.
	 */
	abstract update({
		primaryKey,
		secondaryKey,
		item,
	}: {
		primaryKey: string
		secondaryKey?: string
		item: T
	}): Promise<UpdateResult<T>>

	/**
	 * Delete an item from the database.
	 */
	abstract delete({ primaryKey }: { primaryKey: string }): Promise<DeleteResult>
}
