'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, Copy, Download, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuth } from '@/contexts/admin-auth-context'

type Enrollment = {
  qrCodeDataUrl: string
  manualKey: string
  expiresAt: string
}

export function MfaSetupPage() {
  const { logout } = useAdminAuth()
  const [status, setStatus] = useState<'loading' | 'required' | 'enabled'>('loading')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/security/mfa', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Sessao indisponivel')
        return response.json()
      })
      .then(data => setStatus(data.enabled ? 'enabled' : 'required'))
      .catch(() => setError('Nao foi possivel carregar o estado de seguranca. Entre novamente.'))
  }, [])

  const startEnrollment = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/security/mfa', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel iniciar a configuracao.')
      setEnrollment(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel iniciar a configuracao.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnrollment = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/security/mfa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel confirmar o codigo.')
      setRecoveryCodes(data.recoveryCodes || [])
      setEnrollment(null)
      setStatus('enabled')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel confirmar o codigo.')
    } finally {
      setBusy(false)
    }
  }

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'))
  }

  const downloadRecoveryCodes = () => {
    const blob = new Blob([
      `Brookie Pregiato - codigos de recuperacao\n\n${recoveryCodes.join('\n')}\n\nCada codigo funciona uma unica vez.`,
    ], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'brookie-codigos-recuperacao.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl items-center justify-center">
      <Card className="w-full overflow-hidden border-primary/20 shadow-lg">
        <CardHeader className="border-b border-border/60 bg-primary/5 p-5">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>Protecao em duas etapas</CardTitle>
          <CardDescription>
            O acesso administrativo exige senha e um codigo temporario do Google Authenticator ou app TOTP compativel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {status === 'loading' && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando sua conta...
            </div>
          )}

          {status === 'required' && !enrollment && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Antes de acessar pedidos ou dados de clientes, vincule seu autenticador. Essa etapa e obrigatoria para todos os administradores.
              </p>
              <Button onClick={startEnrollment} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Configurar autenticador
              </Button>
            </div>
          )}

          {enrollment && (
            <div className="space-y-4">
              <ol className="space-y-1 text-sm text-muted-foreground">
                <li>1. Abra o Google Authenticator e toque em adicionar.</li>
                <li>2. Leia o QR Code abaixo.</li>
                <li>3. Digite o codigo de 6 numeros para confirmar.</li>
              </ol>
              <div className="mx-auto w-fit rounded-xl border border-border bg-[#FFF8EE] p-3">
                <Image
                  src={enrollment.qrCodeDataUrl}
                  alt="QR Code para configurar o autenticador"
                  width={224}
                  height={224}
                  unoptimized
                  className="h-56 w-56"
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Chave manual, caso a camera nao funcione</p>
                <code className="mt-1 block break-all text-sm font-semibold tracking-wider">{enrollment.manualKey}</code>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Codigo do autenticador</Label>
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em]"
                />
              </div>
              <Button onClick={confirmEnrollment} disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Confirmar protecao
              </Button>
            </div>
          )}

          {status === 'enabled' && recoveryCodes.length === 0 && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="font-medium text-primary">Autenticador ativo.</p>
              <p className="text-sm text-muted-foreground">Entre novamente usando sua senha e o codigo temporario.</p>
              <Button onClick={logout} className="w-full">Voltar ao login seguro</Button>
            </div>
          )}

          {recoveryCodes.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                Salve estes codigos agora. Eles nao serao exibidos novamente e cada um funciona somente uma vez.
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/35 p-3 font-mono text-sm">
                {recoveryCodes.map(value => <code key={value}>{value}</code>)}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={copyRecoveryCodes}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                <Button variant="outline" onClick={downloadRecoveryCodes}><Download className="mr-2 h-4 w-4" />Baixar</Button>
              </div>
              <Button onClick={logout} className="w-full">Ja salvei, entrar novamente</Button>
            </div>
          )}

          {error && (
            <div className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={logout} className="w-full">
                Limpar sessao e voltar ao login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
