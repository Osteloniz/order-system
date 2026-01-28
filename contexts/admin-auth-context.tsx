'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, signOut, useSession } from 'next-auth/react'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: { tenant: string; username: string; password: string }) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { status } = useSession()
  const isLoading = status === 'loading'
  const isAuthenticated = status === 'authenticated'

  const login = useCallback(async (data: { tenant: string; username: string; password: string }) => {
    try {
      const res = await signIn('credentials', {
        redirect: false,
        tenant: data.tenant,
        username: data.username,
        password: data.password
      })

      if (res?.error) {
        return { success: false, error: res.error }
      }

      return { success: true }
    } catch {
      return { success: false, error: 'Erro de conexão' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await signOut({ redirect: false })
    } finally {
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
