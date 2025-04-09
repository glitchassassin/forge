import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { beforeEach, afterEach } from 'vitest'

// Use the test pool id to create a unique test database path per test runner
const TEST_DB_PATH = join(process.cwd(), 'data', `test.${process.env.VITEST_POOL_ID || 0}.db`)

// Set the test database path globally
process.env.DATABASE_PATH = TEST_DB_PATH

// Clean up the test database before and after all tests
beforeEach(async () => {
  try {
    await rm(TEST_DB_PATH)
    await rm(TEST_DB_PATH + "-wal")
    await rm(TEST_DB_PATH + "-shm")
  } catch (error) {
    // Ignore errors if the file doesn't exist
  }
})

afterEach(async () => {
  try {
    await rm(TEST_DB_PATH)
    await rm(TEST_DB_PATH + "-wal")
    await rm(TEST_DB_PATH + "-shm")
  } catch (error) {
    // Ignore errors if the file doesn't exist
  }
}) 