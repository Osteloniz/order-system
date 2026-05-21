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
  const { isAuthenticated, isLoading } = useAdminAuth()
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

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-background">
      <AdminSidebar collapsed={sidebarCollapsed} onToggleCollapsed={handleToggleSidebar} />
      <main className={`min-w-0 flex-1 overflow-x-hidden px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+4.5rem)] transition-[margin] duration-200 md:p-8 md:pt-8 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {children}
      </main>
    </div>
  )
}
