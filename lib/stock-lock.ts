import type { Prisma } from '@prisma/client'

// All participating stock writers acquire this before reading stock or commitments.
// An advisory lock coordinates first writes even when the stock row does not exist.
export async function lockTenantStock(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT true FROM pg_advisory_xact_lock(hashtextextended(${'brookie:stock:' + tenantId}, 0))`
}
