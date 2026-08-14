'use client'

import React from "react"

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Lock, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAdminAuth } from '@/contexts/admin-auth-context'

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { beginLogin, isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const identifier = searchParams.get('identifier')?.trim()
    if (identifier) {
      setUsername(identifier)
    }
  }, [searchParams])

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/admin')
    }
  }, [authLoading, isAuthenticated, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const result = await beginLogin({ email: username, password: senha })

    if (result.success) {
      router.push('/admin/login/verificacao')
    } else {
      setError(result.error || 'Usuario ou senha invalidos.')
    }

    setIsSubmitting(false)
  }

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="brookie-login-background relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(197,104,19,.24),transparent_42%)]" />
      <Card className="relative z-10 w-full max-w-[390px] border-[#E7DBB3]/35 bg-[#FFF8EE]/95 shadow-2xl backdrop-blur-md">
        <CardHeader className="space-y-2 p-5 pb-3 text-center">
          <Image
            src="/brand/brookie-mark-color.jpg"
            alt="Brookie Pregiato"
            width={72}
            height={72}
            priority
            className="mx-auto h-16 w-16 rounded-full border-2 border-[#E7DBB3] object-cover shadow-sm"
          />
          <CardTitle className="text-[#421C14]">Acesso restrito</CardTitle>
          <CardDescription className="text-[#421C14]/70">
            Primeiro confirme seu e-mail e senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="username">E-mail autorizado</Label>
              <Input
                id="username"
                type="email"
                placeholder="seu@email.com"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
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
                  autoComplete="current-password"
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
              className="w-full bg-[#40631A] hover:bg-[#365416]"
              disabled={isSubmitting || !username || !senha}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Continuar<ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-[11px] text-[#421C14]/55">
            Tentativas e acessos sao monitorados. Nao compartilhe credenciais.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
