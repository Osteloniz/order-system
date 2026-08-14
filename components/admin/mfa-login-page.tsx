'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuth } from '@/contexts/admin-auth-context'

export function MfaLoginPage() {
  const router = useRouter()
  const { completeLogin, isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [loginHint, setLoginHint] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace('/admin')
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    fetch('/api/auth/admin/password', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.valid) throw new Error()
        setLoginHint(String(data.loginHint || ''))
        setStatus('ready')
      })
      .catch(() => setStatus('invalid'))
  }, [])

  const goBack = async () => {
    await fetch('/api/auth/admin/password', { method: 'DELETE' }).catch(() => null)
    router.replace('/admin/login')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await completeLogin(code)
    if (result.success) router.replace('/admin')
    else setError(result.error || 'Codigo invalido.')
    setBusy(false)
  }

  if (authLoading || isAuthenticated || status === 'loading') {
    return <div className="flex min-h-dvh items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }

  return (
    <div className="brookie-login-background relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <Card className="relative z-10 w-full max-w-[390px] border-[#E7DBB3]/35 bg-[#FFF8EE]/95 shadow-2xl backdrop-blur-md">
        <CardHeader className="space-y-2 p-5 pb-3 text-center">
          <Image src="/brand/brookie-mark-color.jpg" alt="Brookie Pregiato" width={72} height={72} className="mx-auto h-16 w-16 rounded-full border-2 border-[#E7DBB3] object-cover" />
          <CardTitle className="text-[#421C14]">Confirme o segundo fator</CardTitle>
          <CardDescription className="text-[#421C14]/70">
            {status === 'ready' ? `Senha confirmada para ${loginHint}.` : 'A verificacao anterior expirou.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {status === 'invalid' ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">Volte ao login e confirme sua senha novamente.</p>
              <Button onClick={goBack} className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao login</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mfa-login-code">Codigo do autenticador</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="mfa-login-code" autoFocus value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '').slice(0, 11))} className="pl-9 text-center tracking-[0.25em]" inputMode="text" autoComplete="one-time-code" placeholder="000000" />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">Use o codigo atual do Google Authenticator ou um codigo de recuperacao.</p>
              </div>
              {error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full bg-[#40631A] hover:bg-[#365416]" disabled={busy || code.length < 6}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Confirmar e entrar
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />Trocar e-mail</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
