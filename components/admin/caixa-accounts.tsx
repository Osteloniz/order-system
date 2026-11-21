'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { getAdminUsernamePolicyError, getPasswordPolicyError } from '@/lib/admin-credential-policy'

type Conta = { id: string; nome: string; username: string; ativo: boolean }

async function contasCaixa(method = 'GET', data?: unknown) {
  const response = await fetch('/api/admin/caixa-contas', {
    method, cache: 'no-store',
    ...(data !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Não foi possível consultar as contas.')
  return payload
}

export function CaixaAccounts() {
  const { tenantId } = useAdminAuth()
  const { data, error, mutate } = useSWR<Conta[]>(tenantId ? [tenantId, 'admin-caixa-contas'] : null, () => contasCaixa(), { shouldRetryOnError: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function change(method: string, payload: unknown) {
    setBusy(true)
    setMessage('')
    try {
      await contasCaixa(method, payload)
      setMessage(method === 'POST' ? 'Conta operacional criada.' : 'Conta desativada. Sessões encerradas.')
      await mutate()
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na operação.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const dados = new FormData(form)
    const login = String(dados.get('login') ?? '')
    const senha = String(dados.get('senha') ?? '')
    const invalid = getAdminUsernamePolicyError(login) ?? getPasswordPolicyError(senha)
    if (invalid) return setMessage(invalid)
    if (await change('POST', Object.fromEntries(dados))) form.reset()
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="caixa-contas">
      <h2 id="caixa-contas" className="font-semibold">Acessos do Caixa</h2>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <details>
        <summary className="min-h-10 cursor-pointer text-sm font-semibold">Criar conta individual</summary>
        <form onSubmit={create} className="grid max-w-lg gap-2">
          <Label htmlFor="caixa-conta-nome">Nome do operador</Label>
          <Input id="caixa-conta-nome" name="nome" required minLength={2} maxLength={80} />
          <Label htmlFor="caixa-conta-login">Login</Label>
          <Input id="caixa-conta-login" name="login" required minLength={3} maxLength={40} autoComplete="off" />
          <Label htmlFor="caixa-conta-senha">Senha individual</Label>
          <Input id="caixa-conta-senha" name="senha" type="password" required minLength={12} autoComplete="new-password" aria-describedby="caixa-senha-requisitos" />
          <p id="caixa-senha-requisitos" className="text-xs text-muted-foreground">Use 12 ou mais caracteres com maiúscula, minúscula e número.</p>
          <Button className="justify-self-start" disabled={busy}>Criar conta</Button>
        </form>
      </details>
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta de Caixa cadastrada.</p>}
      <ul className="divide-y">
        {data?.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div><p className="text-sm font-semibold">{user.nome}</p><p className="text-xs text-muted-foreground">@{user.username} · {user.ativo ? 'Ativa' : 'Desativada'}</p></div>
          {user.ativo && <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>Desativar</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Desativar conta de Caixa</AlertDialogTitle>
                <AlertDialogDescription>As sessões de {user.nome} serão encerradas. As vendas e a autoria ficam no histórico.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={() => change('PATCH', { id: user.id, ativo: false })}>Desativar conta</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}
        </li>)}
      </ul>
    </section>
  )
}
