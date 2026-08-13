import { prisma } from '@/lib/db'

const WINDOW_MS = 15 * 60 * 1000
const MAX_IP_FAILURES = 10
const MAX_IDENTIFIER_FAILURES = 5

export async function isPersistentlyAuthBlocked(params: { ipHash: string; identifier?: string | null }) {
  const since = new Date(Date.now() - WINDOW_MS)
  const [lastIpSuccess, lastIdentifierSuccess] = await Promise.all([
    prisma.authAuditLog.findFirst({
      where: {
        action: 'LOGIN_SUCCESS',
        ipHash: params.ipHash,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    params.identifier
      ? prisma.authAuditLog.findFirst({
          where: {
            action: 'LOGIN_SUCCESS',
            identifier: params.identifier,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ])
  const ipSince = lastIpSuccess?.createdAt ?? since
  const identifierSince = lastIdentifierSuccess?.createdAt ?? since
  const [ipFailures, identifierFailures] = await Promise.all([
    prisma.authAuditLog.count({
      where: {
        action: 'LOGIN_FAILURE',
        ipHash: params.ipHash,
        createdAt: { gt: ipSince },
      },
    }),
    params.identifier
      ? prisma.authAuditLog.count({
          where: {
            action: 'LOGIN_FAILURE',
            identifier: params.identifier,
            createdAt: { gt: identifierSince },
          },
        })
      : Promise.resolve(0),
  ])

  return ipFailures >= MAX_IP_FAILURES || identifierFailures >= MAX_IDENTIFIER_FAILURES
}
