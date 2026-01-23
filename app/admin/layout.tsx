import React from "react"
import { AdminAuthProvider } from '@/contexts/admin-auth-context'

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminAuthProvider>
      {children}
    </AdminAuthProvider>
  )
}
