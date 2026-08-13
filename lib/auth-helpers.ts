import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAllowedAdminEmail } from '@/lib/admin-allowlist'

export async function getPendingAdminSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId as string | undefined
  const adminUserId = (session.user as any).id as string | undefined
  const adminNome = session.user.name ?? undefined
  const sessionVersion = Number((session.user as any).sessionVersion)
  if (!tenantId || !adminUserId || !Number.isInteger(sessionVersion)) return null

  const user = await prisma.adminUser.findFirst({
    where: { id: adminUserId, tenantId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      email: true,
      emailNormalizado: true,
      ativo: true,
      sessionVersion: true,
      totpEnabledAt: true,
      totpSecretEncrypted: true,
      totpPendingSecretEncrypted: true,
      totpPendingExpiresAt: true,
    },
  })

  if (
    !user ||
    !user.ativo ||
    user.sessionVersion !== sessionVersion ||
    !isAllowedAdminEmail(user.emailNormalizado)
  ) {
    return null
  }

  return { session, tenantId, adminUserId, adminNome, user }
}

export async function getAdminSession() {
  const admin = await getPendingAdminSession()
  if (!admin) return null

  const mfaVerified = Boolean((admin.session.user as any).mfaVerified)
  if (!mfaVerified || !admin.user.totpEnabledAt || !admin.user.totpSecretEncrypted) return null
  return admin
}
