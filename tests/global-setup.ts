import { execSync } from 'node:child_process'
import { stat, access } from 'node:fs/promises'
import path from 'node:path'

export const BASE_DATABASE_PATH = path.join(
	process.cwd(),
	`./tests/prisma/base.db`,
)

export async function setup() {
	let databaseExists = false
	try {
		await access(BASE_DATABASE_PATH)
		databaseExists = true
	} catch {
		databaseExists = false
	}

	if (databaseExists) {
		const databaseLastModifiedAt = (await stat(BASE_DATABASE_PATH)).mtime
		const prismaSchemaLastModifiedAt = (await stat('./prisma/schema.prisma'))
			.mtime

		if (prismaSchemaLastModifiedAt < databaseLastModifiedAt) {
			return
		}
	}

	execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: `file:${BASE_DATABASE_PATH}`,
		},
	})
}
