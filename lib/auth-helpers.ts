import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId as string | undefined
  const adminUserId = (session.user as any).id as string | undefined
  const adminNome = session.user.name ?? undefined
  if (!tenantId) return null
  return { session, tenantId, adminUserId, adminNome }
}
