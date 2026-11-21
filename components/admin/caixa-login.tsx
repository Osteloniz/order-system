'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const preferenciaCaixa = 'brookie-caixa-login'

export function CaixaLogin({ lojas }: { lojas: { nome: string; slug: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const expired = params.has('expirada')
  const erroLogin = params.get('erro')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loja, setLoja] = useState(lojas[0]?.slug ?? '')
  const [lembrar, setLembrar] = useState(false)
  const loginRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const valor = localStorage.getItem(preferenciaCaixa)
      if (!valor) return
      const preferencia = JSON.parse(valor) as { loja?: string; login?: string }
      if (preferencia.loja && lojas.some(({ slug }) => slug === preferencia.loja)) setLoja(preferencia.loja)
      if (loginRef.current && !loginRef.current.value && typeof preferencia.login === 'string') {
        loginRef.current.value = preferencia.login
      }
      setLembrar(true)
    } catch {
      // Browser storage can be unavailable in private or restricted sessions.
    }
  }, [lojas])

  function lembrarAcesso(event: FormEvent<HTMLFormElement>) {
    setBusy(true)
    try {
      if (lembrar) {
        const login = new FormData(event.currentTarget).get('login')
        localStorage.setItem(preferenciaCaixa, JSON.stringify({ loja, login }))
      } else {
        localStorage.removeItem(preferenciaCaixa)
      }
    } catch {
      // Sign-in also works when the device blocks local preferences.
    }
  }

  const mensagem = error || (erroLogin === 'limite' ? 'Muitas tentativas. Aguarde para tentar novamente.'
    : erroLogin === 'credenciais' ? 'Credenciais inválidas.'
    : erroLogin === 'indisponivel' ? 'Acesso indisponível. Tente novamente.' : '')

  return (
    <main className="brookie-login-background grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm bg-card text-card-foreground shadow-xl">
        <CardHeader className="gap-4">
          <Image src="/brand/brookie-mark-color.jpg" width={56} height={56} alt="Brookie Pregiato" className="rounded-full" />
          <CardTitle className="text-xl">Entrar no Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          {expired && <p role="status" className="mb-3 text-sm text-muted-foreground">Sessão expirada. Entre para retomar sua cesta.</p>}
          <form method="post" action="/api/caixa/acesso" onSubmit={lembrarAcesso} className="grid gap-3">
            <Label htmlFor="caixa-loja">Loja</Label>
            <select name="tenant" id="caixa-loja" value={loja} onChange={(event) => setLoja(event.target.value)} required
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
              <option value="" disabled>Selecione a loja</option>
              {lojas.map(({ slug, nome }) => <option key={slug} value={slug}>{nome}</option>)}
            </select>
            <Label htmlFor="caixa-login">Login</Label>
            <Input ref={loginRef} name="login" id="caixa-login" autoComplete="username" autoCapitalize="none" required />
            <Label htmlFor="caixa-senha">Senha</Label>
            <Input name="senha" id="caixa-senha" type="password" autoComplete="current-password" required />
            {mensagem && <p role="alert" className="text-sm text-destructive">{mensagem}</p>}
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={lembrar}
                onChange={(event) => {
                  setLembrar(event.target.checked)
                  if (!event.target.checked) {
                    try { localStorage.removeItem(preferenciaCaixa) } catch { /* Browser storage may be unavailable. */ }
                  }
                }} />
              Lembrar loja e login neste navegador
            </label>
            <p className="text-xs text-muted-foreground">A senha pode ser salva pelo gerenciador do navegador. A sessão dura até 8 horas e bloqueia após 15 minutos sem uso.</p>
            <Button className="h-11" disabled={busy || !loja}>{busy ? 'Entrando…' : 'Entrar'}</Button>
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
