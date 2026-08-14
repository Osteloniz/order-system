import type { Metadata } from 'next'
import { MfaLoginPage } from '@/components/admin/mfa-login-page'

export const metadata: Metadata = {
  title: 'Confirmar acesso | Brookie Pregiato',
  robots: { index: false, follow: false },
}

export default function AdminMfaLoginPage() {
  return <MfaLoginPage />
}
