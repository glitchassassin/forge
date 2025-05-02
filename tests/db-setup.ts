import { copyFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeEach } from 'vitest'
import { BASE_DATABASE_PATH } from './global-setup.ts'

const databaseFile = `./tests/prisma/data.${process.env.VITEST_POOL_ID || 0}.db`
const databasePath = path.join(process.cwd(), databaseFile)
process.env.DATABASE_URL = `file:${databasePath}`

beforeEach(async () => {
	await copyFile(BASE_DATABASE_PATH, databasePath)
})

afterAll(async () => {
	// we *must* use dynamic imports here so the process.env.DATABASE_URL is set
	// before prisma is imported and initialized
	const { prisma } = await import('../src/db/index.ts')
	await prisma.$disconnect()
	await rm(databasePath)
})
