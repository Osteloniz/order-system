import { prisma } from '@/lib/db'

const WINDOW_MS = 15 * 60 * 1000
const MAX_IP_FAILURES = 10
const MAX_IDENTIFIER_FAILURES = 5

export async function isPersistentlyAuthBlocked(params: { ipHash: string; identifier?: string | null }) {
  const since = new Date(Date.now() - WINDOW_MS)
  const [ipFailures, identifierFailures] = await Promise.all([
    prisma.authAuditLog.count({
      where: {
        action: 'LOGIN_FAILURE',
        ipHash: params.ipHash,
        createdAt: { gte: since },
      },
    }),
    params.identifier
      ? prisma.authAuditLog.count({
          where: {
            action: 'LOGIN_FAILURE',
            identifier: params.identifier,
            createdAt: { gte: since },
          },
        })
      : Promise.resolve(0),
  ])

  return ipFailures >= MAX_IP_FAILURES || identifierFailures >= MAX_IDENTIFIER_FAILURES
}
