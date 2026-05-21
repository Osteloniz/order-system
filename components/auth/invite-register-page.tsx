'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Lock, Mail, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type InviteValidation =
  | { loading: true; valid: false; message: string }
  | { loading: false; valid: true; message: string; emailHint: string }
  | { loading: false; valid: false; message: string }

function getInviteMessage(reason?: string) {
  switch (reason) {
    case 'USED':
      return 'Este convite ja foi utilizado.'
    case 'EXPIRED':
      return 'Este convite expirou. Solicite um novo convite.'
    case 'REVOKED':
      return 'Este convite foi revogado.'
    case 'ALREADY_REGISTERED':
      return 'Ja existe um usuario criado para este convite.'
    default:
      return 'Convite invalido ou indisponivel.'
  }
}

export function InviteRegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams])
  const [validation, setValidation] = useState<InviteValidation>({
    loading: true,
    valid: false,
    message: 'Validando convite...',
  })
  const [nome, setNome] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successIdentifier, setSuccessIdentifier] = useState('')

  useEffect(() => {
    if (!token) {
      setValidation({
        loading: false,
        valid: false,
        message: 'Convite invalido ou ausente.',
      })
      return
    }

    let active = true

    fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!active) return

        if (data?.valid) {
          setValidation({
            loading: false,
            valid: true,
            message: 'Convite valido. Defina seu nome e senha para concluir.',
            emailHint: String(data.emailHint || ''),
          })
          return
        }

        setValidation({
          loading: false,
          valid: false,
          message: getInviteMessage(data?.reason),
        })
      })
      .catch(() => {
        if (!active) return
        setValidation({
          loading: false,
          valid: false,
          message: 'Nao foi possivel validar o convite agora.',
        })
      })

    return () => {
      active = false
    }
  }, [token])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!validation.valid) return
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas nao conferem.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/auth/register/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          nome,
          password,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Nao foi possivel concluir o cadastro.')
        return
      }

      const identifier = String(data?.email || '')
      setSuccessIdentifier(identifier)
      setTimeout(() => {
        router.push(`/admin/login${identifier ? `?identifier=${encodeURIComponent(identifier)}` : ''}`)
      }, 1200)
    } catch {
      setError('Erro de conexao ao concluir o cadastro.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Criar acesso administrativo</CardTitle>
          <CardDescription>
            Este cadastro so funciona com convite valido e de uso unico.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {validation.loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando convite...
            </div>
          ) : validation.valid ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
              <div className="font-medium text-foreground">Convite valido</div>
              <div className="mt-1 text-muted-foreground">{validation.message}</div>
              <div className="mt-2 flex items-center gap-2 text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span>{validation.emailHint}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {validation.message}
            </div>
          )}

          {successIdentifier ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              Cadastro concluido com sucesso. Redirecionando para o login...
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nome"
                  value={nome}
                  onChange={event => setNome(event.target.value)}
                  className="pl-9"
                  disabled={!validation.valid || isSubmitting || Boolean(successIdentifier)}
                  placeholder="Seu nome de exibicao"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="pl-9"
                  disabled={!validation.valid || isSubmitting || Boolean(successIdentifier)}
                  placeholder="Minimo de 8 caracteres"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                disabled={!validation.valid || isSubmitting || Boolean(successIdentifier)}
                placeholder="Repita a senha"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={!validation.valid || !nome.trim() || !password || !confirmPassword || isSubmitting || Boolean(successIdentifier)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando usuario...
                </>
              ) : (
                'Concluir cadastro'
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            Ja tem acesso?{' '}
            <Link href="/admin/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Ir para o login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
