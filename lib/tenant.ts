import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export async function getTenantFromCookie() {
  const cookieStore = await cookies()
  const slug = cookieStore.get('tenant_slug')?.value
  if (!slug) return null
  return prisma.tenant.findUnique({ where: { slug } })
}

