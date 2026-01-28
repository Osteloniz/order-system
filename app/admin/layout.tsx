import React from 'react'
import { AdminProviders } from '@/components/admin/admin-providers'

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminProviders>{children}</AdminProviders>
  )
}
