import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryRepository } from './in-memory'

interface TestItem {
	id: string
	name: string
	value: number
}

describe('InMemoryRepository', () => {
	let repository: InMemoryRepository<TestItem>

	beforeEach(() => {
		repository = new InMemoryRepository<TestItem>()
	})

	describe('create', () => {
		it('should create and store a new item', async () => {
			const item = { id: '1', name: 'test', value: 42 }
			const result = await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})

			expect(result).toEqual({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})
		})

		it('should overwrite existing item with same primary key', async () => {
			const item1 = { id: '1', name: 'test1', value: 42 }
			const item2 = { id: '1', name: 'test2', value: 43 }

			await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item: item1,
			})

			const result = await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk2',
				item: item2,
			})

			expect(result).toEqual({
				primaryKey: 'pk1',
				secondaryKey: 'sk2',
				item: item2,
			})
		})
	})

	describe('readById', () => {
		it('should return the item for a given primary key', async () => {
			const item = { id: '1', name: 'test', value: 42 }
			await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})

			const result = await repository.readById({ primaryKey: 'pk1' })
			expect(result).toEqual({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})
		})

		it('should return undefined for non-existent primary key', async () => {
			const result = await repository.readById({ primaryKey: 'nonexistent' })
			expect(result).toBeUndefined()
		})
	})

	describe('read', () => {
		it('should return all items for a given secondary key', async () => {
			const item1 = { id: '1', name: 'test1', value: 42 }
			const item2 = { id: '2', name: 'test2', value: 43 }
			const item3 = { id: '3', name: 'test3', value: 44 }

			await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item: item1,
			})
			await repository.create({
				primaryKey: 'pk2',
				secondaryKey: 'sk1',
				item: item2,
			})
			await repository.create({
				primaryKey: 'pk3',
				secondaryKey: 'sk2',
				item: item3,
			})

			const results = await repository.read({ secondaryKey: 'sk1' })
			expect(results).toHaveLength(2)
			expect(results).toEqual(
				expect.arrayContaining([
					{
						primaryKey: 'pk1',
						secondaryKey: 'sk1',
						item: item1,
					},
					{
						primaryKey: 'pk2',
						secondaryKey: 'sk1',
						item: item2,
					},
				]),
			)
		})

		it('should respect limit and offset parameters', async () => {
			const items = Array.from({ length: 5 }, (_, i) => ({
				id: String(i + 1),
				name: `test${i + 1}`,
				value: i + 1,
			}))

			for (const [index, item] of items.entries()) {
				await repository.create({
					primaryKey: `pk${index + 1}`,
					secondaryKey: 'sk1',
					item,
				})
			}

			const results = await repository.read({
				secondaryKey: 'sk1',
				limit: 2,
				offset: 1,
			})

			expect(results).toHaveLength(2)
			expect(results[0]?.item).toEqual(items[1])
			expect(results[1]?.item).toEqual(items[2])
		})

		it('should return empty array for non-existent secondary key', async () => {
			const results = await repository.read({ secondaryKey: 'nonexistent' })
			expect(results).toHaveLength(0)
		})
	})

	describe('update', () => {
		it('should update an existing item', async () => {
			const originalItem = { id: '1', name: 'test', value: 42 }
			const updatedItem = { id: '1', name: 'updated', value: 43 }

			await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item: originalItem,
			})

			const result = await repository.update({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item: updatedItem,
			})

			expect(result).toEqual({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item: updatedItem,
			})

			const readResult = await repository.readById({ primaryKey: 'pk1' })
			expect(readResult?.item).toEqual(updatedItem)
		})

		it('should create item if it does not exist', async () => {
			const item = { id: '1', name: 'test', value: 42 }
			const result = await repository.update({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})

			expect(result).toEqual({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})
		})
	})

	describe('delete', () => {
		it('should delete an existing item', async () => {
			const item = { id: '1', name: 'test', value: 42 }
			await repository.create({
				primaryKey: 'pk1',
				secondaryKey: 'sk1',
				item,
			})

			const result = await repository.delete({ primaryKey: 'pk1' })
			expect(result).toEqual({ primaryKey: 'pk1' })

			const readResult = await repository.readById({ primaryKey: 'pk1' })
			expect(readResult).toBeUndefined()
		})

		it('should handle deletion of non-existent item', async () => {
			const result = await repository.delete({ primaryKey: 'nonexistent' })
			expect(result).toEqual({ primaryKey: 'nonexistent' })
		})
	})
})
