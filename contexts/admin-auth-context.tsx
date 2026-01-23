'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (senha: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Verifica sessão ao montar
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/admin/session', { credentials: 'include' })
        const data = await res.json()
        console.log('[v0] Auth context - session check result:', data)
        setIsAuthenticated(data.authenticated)
      } catch (err) {
        console.log('[v0] Auth context - session check error:', err)
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }
    checkSession()
  }, [])

  const login = useCallback(async (senha: string) => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
        credentials: 'include'
      })

      if (!res.ok) {
        const data = await res.json()
        return { success: false, error: data.error || 'Erro ao fazer login' }
      }

      setIsAuthenticated(true)
      return { success: true }
    } catch {
      return { success: false, error: 'Erro de conexão' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } finally {
      setIsAuthenticated(false)
      router.push('/admin/login')
    }
  }, [router])

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth deve ser usado dentro de AdminAuthProvider')
  }
  return context
}
