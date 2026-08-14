import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginPage } from '@/components/admin/login-page'

export const metadata: Metadata = {
  title: 'Acesso restrito | Brookie Pregiato',
  description: 'Acesso interno protegido.',
  robots: { index: false, follow: false },
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  )
}
