'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, signIn, signOut, useSession } from 'next-auth/react'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  mfaVerified: boolean
  mfaEnrollmentRequired: boolean
  beginLogin: (data: { identifier: string; password: string }) => Promise<{ success: boolean; enrollmentRequired?: boolean; error?: string }>
  completeLogin: (code: string) => Promise<{ success: boolean; error?: string }>
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

  const beginLogin = useCallback(async (data: { identifier: string; password: string }) => {
    try {
      const response = await fetch('/api/auth/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        return { success: false, error: payload?.error || 'E-mail, login ou senha invalidos.' }
      }

      if (payload?.enrollmentRequired) {
        const enrollment = await signIn('credentials', {
          redirect: false,
          flow: 'enroll',
        })
        if (enrollment?.error) {
          return { success: false, error: 'Nao foi possivel iniciar a configuracao do autenticador.' }
        }
        await fetch('/api/auth/admin/password', { method: 'DELETE' }).catch(() => null)
        await getSession()
        return { success: true, enrollmentRequired: true }
      }

      return { success: true, enrollmentRequired: false }
    } catch {
      return { success: false, error: 'Erro de conexao' }
    }
  }, [])

  const completeLogin = useCallback(async (code: string) => {
    try {
      const res = await signIn('credentials', {
        redirect: false,
        flow: 'mfa',
        code,
      })

      if (res?.error) {
        const genericError = res.error.includes('Muitas tentativas')
          ? 'Muitas tentativas. Tente novamente mais tarde.'
          : 'Codigo invalido, expirado ou ja utilizado.'
        return { success: false, error: genericError }
      }

      await fetch('/api/auth/admin/password', { method: 'DELETE' }).catch(() => null)
      await getSession()
      return { success: true }
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
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, mfaVerified, mfaEnrollmentRequired, beginLogin, completeLogin, logout }}>
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
