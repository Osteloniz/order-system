'use client'

import { type ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { AdminAuthProvider } from '@/contexts/admin-auth-context'

export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AdminAuthProvider>{children}</AdminAuthProvider>
    </SessionProvider>
  )
}
