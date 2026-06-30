// Prisma client singleton to avoid exhausting connections during dev hot-reload.
// Comentarios intencionais para explicar o fluxo.

import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

// Reuse the client in dev; create a fresh one in prod.
export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

