import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

const DEFAULT_TENANT_SLUG = 'brookie-pregiato'

export async function getTenantFromCookie() {
  const cookieStore = await cookies()
  const slug = cookieStore.get('tenant_slug')?.value || DEFAULT_TENANT_SLUG
  const tenant = await prisma.tenant.findUnique({ where: { slug } })

  if (tenant) return tenant

  return prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG } })
}

