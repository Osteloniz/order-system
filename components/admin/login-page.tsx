'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Loader2, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TenantOption = { id: string; nome: string; slug: string }

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [tenant, setTenant] = useState('')
  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tenants, setTenants] = useState<TenantOption[]>([])

  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await fetch('/api/tenants')
        const data = await res.json()
        setTenants(Array.isArray(data) ? data : [])
      } catch {
        setTenants([])
      }
    }
    loadTenants()
  }, [])

  useEffect(() => {
    const tenantFromQuery = searchParams.get('tenant')?.trim()
    if (tenantFromQuery && !tenant) {
      setTenant(tenantFromQuery)
    }
  }, [searchParams, tenant])

  // Redireciona se já autenticado
  if (!authLoading && isAuthenticated) {
    router.push('/admin')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const result = await login({ tenant, username, password: senha })

    if (result.success) {
      router.push('/admin')
    } else {
      setError(result.error || 'Senha incorreta')
    }

    setIsSubmitting(false)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Painel Admin</CardTitle>
          <CardDescription>
            Entre com sua senha para acessar o painel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={tenant} onValueChange={setTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.slug}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                placeholder="Digite seu usuário"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="senha"
                  type="password"
                  placeholder="Digite a senha"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !tenant || !username || !senha}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
