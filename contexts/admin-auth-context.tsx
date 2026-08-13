'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, signIn, signOut, useSession } from 'next-auth/react'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  mfaVerified: boolean
  mfaEnrollmentRequired: boolean
  login: (data: { username: string; password: string; code?: string }) => Promise<{ success: boolean; error?: string; enrollmentRequired?: boolean }>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isLoading = status === 'loading'
  const isAuthenticated = status === 'authenticated'
  const mfaVerified = Boolean((session?.user as any)?.mfaVerified)
  const mfaEnrollmentRequired = Boolean((session?.user as any)?.mfaEnrollmentRequired)

  const login = useCallback(async (data: { username: string; password: string; code?: string }) => {
    try {
      const res = await signIn('credentials', {
        redirect: false,
        username: data.username,
        password: data.password,
        code: data.code || '',
      })

      if (res?.error) {
        const genericError = res.error.includes('Muitas tentativas')
          ? 'Muitas tentativas. Tente novamente mais tarde.'
          : 'Usuario ou senha invalidos.'
        return { success: false, error: genericError }
      }

      const session = await getSession()
      return {
        success: true,
        enrollmentRequired: Boolean((session?.user as any)?.mfaEnrollmentRequired),
      }
    } catch {
      return { success: false, error: 'Erro de conexão' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
      await signOut({ redirect: false })
    } finally {
      router.push('/admin/login')
    }
  }, [router])

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, mfaVerified, mfaEnrollmentRequired, login, logout }}>
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
