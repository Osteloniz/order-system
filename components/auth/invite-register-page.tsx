'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check, Copy, Download, Loader2, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getAdminUsernamePolicyError,
  getPasswordPolicyError,
  getPasswordUtf8ByteLength,
} from '@/lib/admin-credential-policy'

type Stage = 'loading' | 'password' | 'mfa' | 'recovery' | 'invalid'
type Enrollment = { qrCodeDataUrl: string; manualKey: string; expiresAt: string }

function inviteMessage(reason?: string) {
  if (reason === 'USED') return 'Este convite ja foi utilizado.'
  if (reason === 'EXPIRED') return 'Este convite expirou. Solicite um novo convite.'
  if (reason === 'REVOKED') return 'Este convite foi revogado.'
  if (reason === 'ALREADY_REGISTERED') return 'Ja existe um acesso ativo para este e-mail.'
  return 'Convite invalido ou indisponivel.'
}

export function InviteRegisterPage() {
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams])
  const [stage, setStage] = useState<Stage>('loading')
  const [message, setMessage] = useState('Validando convite...')
  const [emailHint, setEmailHint] = useState('')
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const passwordChecks = useMemo(() => [
    { label: '12 ou mais caracteres', valid: password.length >= 12 },
    { label: 'Uma letra maiuscula e uma minuscula', valid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'Pelo menos um numero', valid: /\d/.test(password) },
    { label: 'As duas senhas sao iguais', valid: Boolean(confirmPassword) && password === confirmPassword },
  ], [confirmPassword, password])

  useEffect(() => {
    if (!token) { setStage('invalid'); setMessage('Convite invalido ou ausente.'); return }
    fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!data.valid) { setStage('invalid'); setMessage(inviteMessage(data.reason)); return }
        setEmailHint(String(data.emailHint || ''))
        setStage(data.stage === 'MFA' ? 'mfa' : 'password')
        setMessage(data.stage === 'MFA' ? 'Continue configurando seu autenticador.' : 'Defina sua senha para iniciar a protecao em duas etapas.')
      })
      .catch(() => { setStage('invalid'); setMessage('Nao foi possivel validar o convite agora.') })
  }, [token])

  const startMfa = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/register/invite/mfa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel gerar o autenticador.')
      setEnrollment(data)
      setStage('mfa')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel gerar o autenticador.')
    } finally { setBusy(false) }
  }

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (nome.trim().length < 2) { setError('Informe um nome com pelo menos 2 caracteres.'); return }
    const usernameError = getAdminUsernamePolicyError(username)
    if (usernameError) { setError(usernameError); return }
    const passwordError = getPasswordPolicyError(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirmPassword) { setError('As senhas nao conferem.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/auth/register/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, nome, username, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar a senha.')
      await startMfa()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel salvar a senha.')
      setBusy(false)
    }
  }

  const confirmMfa = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/register/invite/mfa', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel confirmar o codigo.')
      setRecoveryCodes(data.recoveryCodes || [])
      setEmail(String(data.email || ''))
      setStage('recovery')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel confirmar o codigo.')
    } finally { setBusy(false) }
  }

  const downloadCodes = () => {
    const blob = new Blob([`Brookie Pregiato - codigos de recuperacao\n\n${recoveryCodes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'brookie-codigos-recuperacao.txt'; anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="brookie-login-background flex min-h-dvh items-center justify-center p-3 sm:p-4">
      <Card className="w-full max-w-lg gap-0 border-border/80 bg-card/95 py-0 shadow-2xl backdrop-blur-md">
        <CardHeader className="space-y-2 p-4 pb-3 text-center sm:p-5 sm:pb-3">
          <Image src="/brand/brookie-mark-color.jpg" alt="Brookie Pregiato" width={64} height={64} className="mx-auto h-14 w-14 rounded-full border-2 border-[#E7DBB3] object-cover" />
          <CardTitle>Finalizar acesso administrativo</CardTitle>
          <CardDescription>Senha e autenticador sao obrigatorios antes da ativacao.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-2 sm:p-5 sm:pt-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            {stage === 'loading' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Mail className="mr-2 inline h-4 w-4 text-primary" />}
            {message}{emailHint ? ` ${emailHint}` : ''}
          </div>

          {stage === 'password' ? (
            <form onSubmit={savePassword} className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="invite-name">Nome</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="invite-name" value={nome} onChange={event => setNome(event.target.value)} className="pl-9" autoComplete="name" /></div></div>
              <div className="space-y-1.5"><Label htmlFor="invite-username">Login</Label><Input id="invite-username" value={username} onChange={event => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40))} autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="ex.: joao.murat" /><p className="text-[11px] text-muted-foreground">Sera usado junto com o e-mail para entrar.</p></div>
              <div className="space-y-1.5"><Label htmlFor="invite-password">Senha segura</Label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="invite-password" type="password" value={password} onChange={event => setPassword(event.target.value)} className="pl-9" autoComplete="new-password" placeholder="12+ caracteres" aria-invalid={Boolean(password) && Boolean(getPasswordPolicyError(password))} /></div></div>
              <div className="space-y-1.5"><Label htmlFor="invite-confirm">Confirmar senha</Label><Input id="invite-confirm" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div>
              <div className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-xs" aria-live="polite">
                {passwordChecks.map(check => (
                  <p key={check.label} className={check.valid ? 'text-primary' : 'text-muted-foreground'}>
                    <span aria-hidden="true" className="mr-1.5 inline-block w-3 text-center">{check.valid ? '✓' : '•'}</span>
                    {check.label}
                  </p>
                ))}
                <p className={getPasswordUtf8ByteLength(password) <= 72 ? 'text-muted-foreground' : 'text-destructive'}>
                  Simbolos sao aceitos; limite tecnico de 72 bytes.
                </p>
              </div>
              {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" disabled={busy || !nome.trim() || !username || !password || !confirmPassword}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Salvar e configurar autenticador</Button>
            </form>
          ) : null}

          {stage === 'mfa' ? (
            enrollment ? <form onSubmit={confirmMfa} className="space-y-3">
              <ol className="space-y-1 text-sm text-muted-foreground"><li>1. Abra o Google Authenticator.</li><li>2. Leia o QR Code.</li><li>3. Digite o codigo atual para ativar a conta.</li></ol>
              <div className="mx-auto w-fit rounded-xl border bg-[#FFF8EE] p-2"><Image src={enrollment.qrCodeDataUrl} alt="QR Code do autenticador" width={224} height={224} unoptimized className="h-52 w-52" /></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Chave manual</p><code className="break-all text-sm font-semibold tracking-wider">{enrollment.manualKey}</code></div>
              <div className="space-y-1.5"><Label htmlFor="invite-code">Codigo do autenticador</Label><Input id="invite-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="text-center text-lg tracking-[0.3em]" placeholder="000000" /></div>
              {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" disabled={busy || code.length !== 6}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Ativar meu acesso</Button>
            </form> : <div className="space-y-3"><p className="text-sm text-muted-foreground">Sua senha ja foi definida. Gere o QR Code para concluir.</p>{error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}<Button className="w-full" onClick={startMfa} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar autenticador</Button></div>
          ) : null}

          {stage === 'recovery' ? <div className="space-y-4">
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-900">Acesso ativado. Salve os codigos agora; eles nao serao exibidos novamente.</div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-3 font-mono text-sm">{recoveryCodes.map(value => <code key={value}>{value}</code>)}</div>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}><Copy className="mr-2 h-4 w-4" />Copiar</Button><Button variant="outline" onClick={downloadCodes}><Download className="mr-2 h-4 w-4" />Baixar</Button></div>
            <Button asChild className="w-full"><Link href={`/admin/login${email ? `?identifier=${encodeURIComponent(email)}` : ''}`}>Ja salvei, ir para o login</Link></Button>
          </div> : null}

          {stage === 'invalid' ? <Button asChild variant="outline" className="w-full"><Link href="/admin/login">Voltar ao login</Link></Button> : null}
        </CardContent>
      </Card>
    </div>
  )
}
