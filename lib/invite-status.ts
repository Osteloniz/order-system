import type { InviteStatus } from '@prisma/client'

export function resolveInviteStatus(invite: {
  status: InviteStatus
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
}) {
  if (invite.status === 'REVOKED' || invite.revokedAt) return 'REVOKED' as const
  if (invite.status === 'USED' || invite.usedAt) return 'USED' as const
  if (invite.expiresAt.getTime() <= Date.now()) return 'EXPIRED' as const
  return 'PENDING' as const
}
