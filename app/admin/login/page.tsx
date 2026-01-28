import { Suspense } from 'react'
import { LoginPage } from '@/components/admin/login-page'

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  )
}
