'use client'

import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, MailPlus, ShieldCheck, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuth } from '@/contexts/admin-auth-context'

type AccessData = {
  isMaster: boolean
  users: Array<{ id: string; nome: string; email: string | null; role: 'MASTER' | 'ADMIN'; ativo: boolean; totpEnabledAt: string | null }>
  invites: Array<{ id: string; email: string; expiresAt: string }>
}

export function AdminSecurityCenter() {
  const { logout } = useAdminAuth()
  const [data, setData] = useState<AccessData | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const load = async () => {
    const response = await fetch('/api/admin/invites', { cache: 'no-store' })
    if (response.ok) setData(await response.json())
  }
  useEffect(() => { void load() }, [])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setInviteBusy(true); setInviteMessage(''); setManualLink('')
    try {
      const response = await fetch('/api/admin/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel enviar o convite.')
      setInviteMessage(payload.delivered ? 'Convite enviado por e-mail.' : 'Convite criado no HML. Use o link de teste abaixo.')
      setManualLink(String(payload.inviteLink || ''))
      setInviteEmail('')
      await load()
    } catch (cause) { setInviteMessage(cause instanceof Error ? cause.message : 'Nao foi possivel enviar o convite.') }
    finally { setInviteBusy(false) }
  }

  const revoke = async (inviteId: string) => {
    const response = await fetch('/api/admin/invites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteId }) })
    if (response.ok) await load()
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setPasswordMessage('')
    if (newPassword !== confirmPassword) { setPasswordMessage('As novas senhas nao conferem.'); return }
    setPasswordBusy(true)
    try {
      const response = await fetch('/api/admin/security/password', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, code }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel alterar a senha.')
      setPasswordMessage('Senha alterada. Todas as sessoes foram encerradas por seguranca.')
      setTimeout(() => { void logout() }, 1200)
    } catch (cause) { setPasswordMessage(cause instanceof Error ? cause.message : 'Nao foi possivel alterar a senha.') }
    finally { setPasswordBusy(false) }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background/65 p-4">
        <div className="mb-3 flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 text-primary" /><div><h2 className="font-semibold">Alterar minha senha</h2><p className="text-xs text-muted-foreground">Confirme a senha atual e um codigo novo do autenticador. A troca encerra todas as sessoes.</p></div></div>
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="current-password">Senha atual</Label><Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" /></div>
          <div className="space-y-1"><Label htmlFor="password-code">Codigo do autenticador</Label><Input id="password-code" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '').slice(0, 11))} autoComplete="one-time-code" placeholder="Use um codigo novo" /></div>
          <div className="space-y-1"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" /></div>
          <div className="space-y-1"><Label htmlFor="confirm-new-password">Confirmar nova senha</Label><Input id="confirm-new-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div>
          {passwordMessage ? <p className="text-sm text-muted-foreground sm:col-span-2">{passwordMessage}</p> : null}
          <Button className="sm:col-span-2" disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword || code.length < 6}>{passwordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Alterar senha com seguranca</Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-background/65 p-4">
        <div className="mb-3 flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 text-primary" /><div><h2 className="font-semibold">Acessos administrativos</h2><p className="text-xs text-muted-foreground">Novos acessos so ficam ativos depois da senha e do autenticador.</p></div></div>
        {data?.isMaster ? <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row"><Input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="novo.usuario@email.com" /><Button disabled={inviteBusy || !inviteEmail}><MailPlus className="mr-2 h-4 w-4" />Enviar convite</Button></form> : <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Somente o usuario master pode enviar convites.</p>}
        {inviteMessage ? <p className="mt-2 text-sm text-muted-foreground">{inviteMessage}</p> : null}
        {manualLink ? <div className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/30 p-2"><code className="min-w-0 flex-1 truncate text-xs">{manualLink}</code><Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(manualLink)}><Copy className="h-4 w-4" /></Button></div> : null}
        <div className="mt-3 divide-y divide-border rounded-lg border">
          {data?.users.map(user => <div key={user.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{user.nome}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><div className="text-right"><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{user.role === 'MASTER' ? 'Master' : 'Admin'}</span><p className="mt-1 text-[10px] text-muted-foreground">{user.ativo && user.totpEnabledAt ? 'Ativo e protegido' : 'Aguardando ativacao'}</p></div></div>)}
          {data?.invites.map(inviteItem => <div key={inviteItem.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{inviteItem.email}</p><p className="text-xs text-muted-foreground">Convite pendente</p></div>{data.isMaster ? <Button size="icon" variant="ghost" title="Revogar convite" onClick={() => revoke(inviteItem.id)}><X className="h-4 w-4" /></Button> : null}</div>)}
        </div>
      </section>
    </div>
  )
}
