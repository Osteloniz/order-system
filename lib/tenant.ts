import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

const DEFAULT_TENANT_SLUG = 'brookie-pregiato'

export async function getTenantFromCookie() {
  const cookieStore = await cookies()
  const slug = cookieStore.get('tenant_slug')?.value || DEFAULT_TENANT_SLUG
  return prisma.tenant.findUnique({ where: { slug } })
}

