import type { AuthAuditAction, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

type CreateAuthAuditLogParams = {
  tenantId?: string | null
  adminUserId?: string | null
  inviteId?: string | null
  action: AuthAuditAction
  identifier?: string | null
  ipHash?: string | null
  userAgent?: string | null
  metadata?: Prisma.InputJsonValue
}

export async function createAuthAuditLog(params: CreateAuthAuditLogParams) {
  try {
    await prisma.authAuditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        adminUserId: params.adminUserId ?? null,
        inviteId: params.inviteId ?? null,
        action: params.action,
        identifier: params.identifier ?? null,
        ipHash: params.ipHash ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata,
      },
    })
  } catch (error) {
    console.error('[auth-audit] Falha ao registrar auditoria:', error)
  }
}
