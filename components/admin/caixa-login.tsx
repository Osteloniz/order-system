'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CaixaLogin() {
  const router = useRouter()
  const expired = useSearchParams().has('expirada')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const response = await fetch('/api/caixa/acesso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      router.replace('/caixa')
      router.refresh()
    } catch (error) {
      setError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Conexão indisponível. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="brookie-login-background grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm bg-card text-card-foreground shadow-xl">
        <CardHeader className="gap-4">
          <Image src="/brand/brookie-mark-color.jpg" width={56} height={56} alt="Brookie Pregiato" className="rounded-full" />
          <CardTitle className="text-xl">Entrar no Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          {expired && <p role="status" className="mb-3 text-sm text-muted-foreground">Sessão expirada. Entre para retomar sua cesta.</p>}
          <form onSubmit={entrar} className="grid gap-3">
            <Label htmlFor="caixa-loja">Loja</Label>
            <Input name="tenant" id="caixa-loja" defaultValue="brookie-pregiato" autoCapitalize="none" required />
            <Label htmlFor="caixa-login">Login</Label>
            <Input name="login" id="caixa-login" autoComplete="username" autoCapitalize="none" required />
            <Label htmlFor="caixa-senha">Senha</Label>
            <Input name="senha" id="caixa-senha" type="password" autoComplete="current-password" required />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="h-11" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
          </form>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link href="/admin/login" onClick={async (event) => {
              event.preventDefault()
              try {
                const result = await fetch('/api/caixa/acesso', { method: 'DELETE' })
                if (!result.ok) throw new Error()
                router.replace('/admin/login')
              } catch {
                setError('Não foi possível encerrar o acesso operacional. Tente novamente.')
              }
            }}>Acesso administrativo</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
