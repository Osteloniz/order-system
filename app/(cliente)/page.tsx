import { cookies } from 'next/headers'
import { MenuPage } from '@/components/menu/menu-page'
import { TenantSelectPage } from '@/components/menu/tenant-select-page'

export default async function HomePage() {
  const cookieStore = await cookies()
  const tenantSlug = cookieStore.get('tenant_slug')?.value

  if (!tenantSlug) {
    return <TenantSelectPage />
  }

  return <MenuPage />
}
