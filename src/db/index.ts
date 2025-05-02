import { PrismaClient } from '@prisma/client'

console.log('db/index.ts DATABASE_URL', process.env.DATABASE_URL)

export const prisma = new PrismaClient()
