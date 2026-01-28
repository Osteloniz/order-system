import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId as string | undefined
  if (!tenantId) return null
  return { session, tenantId }
}
