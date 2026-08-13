'use client'

import React from "react"

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { KeyRound, Lock, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAdminAuth } from '@/contexts/admin-auth-context'

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState('')
  const [code, setCode] = useState('')
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

    const result = await login({ username, password: senha, code })

    if (result.success) {
      router.push(result.enrollmentRequired ? '/admin/seguranca' : '/admin')
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
    <div
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#28110c] p-4"
      style={{
        backgroundImage: "linear-gradient(110deg, rgba(40,17,12,.92), rgba(64,99,26,.72)), url('/brand/brookie-logo-dark.jpg')",
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
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
            Identifique-se com os dois fatores de seguranca.
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

            <div className="space-y-2">
              <Label htmlFor="security-code">Codigo do autenticador</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="security-code"
                  value={code}
                  onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '').slice(0, 11))}
                  className="pl-9 tracking-widest"
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder="000000 ou codigo de recuperacao"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                No primeiro acesso, deixe em branco para vincular o Google Authenticator. Nos proximos, aguarde um codigo novo; cada codigo aceito so pode ser usado uma vez.
              </p>
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
                  Entrando...
                </>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Entrar com seguranca</>
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
