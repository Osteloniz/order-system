'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isLoading, mfaVerified } = useAdminAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/admin/login')
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    const saved = window.localStorage.getItem('admin_sidebar_collapsed')
    setSidebarCollapsed(saved === 'true')
  }, [])

  const handleToggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('admin_sidebar_collapsed', String(next))
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (!mfaVerified) {
    return (
      <main className="min-h-dvh bg-background px-3 py-6">
        {children}
      </main>
    )
  }

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-background">
      <AdminSidebar collapsed={sidebarCollapsed} onToggleCollapsed={handleToggleSidebar} />
      <main className={`min-w-0 flex-1 overflow-x-hidden px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+3.75rem)] transition-[margin] duration-200 md:p-5 md:pt-5 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {children}
      </main>
    </div>
  )
}
