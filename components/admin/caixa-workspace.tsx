'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Banknote, CreditCard, LogOut, Minus, Plus, ScanLine, ShoppingBag } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/theme-toggle'
import { formatarMoeda } from '@/lib/calc'
import { formatPhoneDisplay } from '@/lib/phone'
import { CAIXA_IDLE_MS } from '@/lib/caixa-session-policy'
import { meiosCaixa, meioCaixaLabel, type MeioCaixa, type VendaCaixa } from '@/lib/caixa-contract'
import { CaixaRequestError, hashCotacao, requestCaixa, type ClienteCaixa, type LinhaCaixa, type ProdutoCaixa } from '@/components/admin/caixa-client'
import { CaixaPendencias } from '@/components/admin/caixa-pendencias'
import { CaixaGestao } from '@/components/admin/caixa-gestao'

const icons = { PIX: ScanLine, CREDITO: CreditCard, DEBITO: CreditCard, DINHEIRO: Banknote }
type Catalogo = { produtos: ProdutoCaixa[]; maisVendidos: string[]; novasVendas: boolean }
type Draft = { linhas: LinhaCaixa[]; clienteId: string | null; meio: MeioCaixa; pago: boolean | null; tentativa?: VendaCaixa }

const initial: Draft = { linhas: [], clienteId: null, meio: 'PIX', pago: null }

function readDraft(key: string): Draft {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : initial
  } catch {
    return initial
  }
}

export function CaixaWorkspace({ conta, operacional, initialNumber }: { conta: string; operacional: boolean; initialNumber?: string }) {
  const router = useRouter()
  const key = 'brookie-caixa:' + conta
  const [draft, setDraft] = useState(initial)
  const [ready, setReady] = useState(false)
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState<ClienteCaixa | null>(null)
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [clienteBusca, setClienteBusca] = useState<'idle' | 'busy' | 'missing' | 'found'>('idle')
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  const expire = useCallback(() => {
    router.replace(operacional ? '/caixa/login?expirada=1' : '/admin/login')
  }, [operacional, router])

  const { data, error: catalogError, mutate } = useSWR([conta, 'catalogo'] as const, ([, path]) => requestCaixa<Catalogo>(path), {
    onError: (error) => { if (error.status === 401) expire() },
    shouldRetryOnError: false,
  })

  useEffect(() => {
    setDraft(readDraft(key))
    setReady(true)
  }, [key])

  useEffect(() => {
    if (!operacional) return
    let activity = Date.now()
    let lastPing = 0
    let pingInFlight = false
    const ping = async (event: Event) => {
      if (!event.isTrusted) return
      const now = Date.now()
      if (now - activity >= CAIXA_IDLE_MS) return expire()
      activity = now
      if (pingInFlight || activity - lastPing < 15_000) return
      pingInFlight = true
      try {
        await requestCaixa('acesso', 'PATCH')
        lastPing = now
      } catch (error) {
        if (error instanceof CaixaRequestError && error.status === 401) expire()
      } finally {
        pingInFlight = false
      }
    }
    const timer = setInterval(() => {
      if (Date.now() - activity >= CAIXA_IDLE_MS) expire()
    }, 5_000)
    document.addEventListener('click', ping)
    document.addEventListener('keydown', ping)
    return () => {
      clearInterval(timer)
      document.removeEventListener('click', ping)
      document.removeEventListener('keydown', ping)
    }
  }, [expire, operacional])

  function save(next: Draft) {
    localStorage.setItem(key, JSON.stringify(next))
    setDraft(next)
  }

  function edit(next: Partial<Draft>) {
    if (!ready || inFlight.current || draft.tentativa) return
    try {
      save({ ...draft, ...next })
      setError('')
      setConfirmation('')
    } catch {
      setError('O navegador não conseguiu guardar a cesta neste dispositivo.')
    }
  }

  function quantity(produto: ProdutoCaixa, delta: number) {
    const before = draft.linhas.find((line) => line.produtoId === produto.id)
    const quantidade = (before?.quantidade ?? 0) + delta
    if (quantidade > produto.saldo) return
    edit({ linhas: [...draft.linhas.filter((line) => line.produtoId !== produto.id),
      ...(quantidade > 0 ? [{ produtoId: produto.id, nome: produto.nome, preco: before?.preco ?? produto.preco, quantidade }] : [])] })
  }

  function remove(line: LinhaCaixa) {
    edit({ linhas: draft.linhas.flatMap((item) => item.produtoId !== line.produtoId ? [item]
      : item.quantidade > 1 ? [{ ...item, quantidade: item.quantidade - 1 }] : []) })
  }

  function showError(error: unknown) {
    if (error instanceof CaixaRequestError && error.status === 401) expire()
    setError(error instanceof Error ? error.message : 'Falha na comunicação com o servidor.')
  }

  async function lookup(event: FormEvent, create: boolean) {
    event.preventDefault()
    setClienteBusca('busy')
    setError('')
    try {
      const result = create
        ? await requestCaixa<{ cliente: ClienteCaixa }>('clientes', 'POST', { nome, telefone })
        : await requestCaixa<{ cliente: ClienteCaixa | null }>('clientes?telefone=' + encodeURIComponent(telefone))
      setCliente(result.cliente)
      setClienteBusca(result.cliente ? 'found' : 'missing')
    } catch (error) {
      setClienteBusca('idle')
      showError(error)
    }
  }

  async function concluir() {
    if (!ready || inFlight.current) return
    if (!draft.tentativa && (!data?.novasVendas || !draft.linhas.length || draft.pago === null || (draft.pago === false && !draft.clienteId))) return
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const tentativa = draft.tentativa ?? {
        clienteId: draft.clienteId, pago: draft.pago === true, meio: draft.meio, tentativa: crypto.randomUUID(),
        itens: draft.linhas.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
        cotacao: await hashCotacao(draft.linhas),
      }
      save({ ...draft, tentativa })
      const venda = await requestCaixa<{ numero: string }>('vendas', 'POST', tentativa)
      save(initial)
      setConfirmation('Venda #' + venda.numero + ' concluída.')
      setCliente(null)
      setClienteBusca('idle')
      setTelefone('')
      setNome('')
      void mutate()
    } catch (error) {
      if (error instanceof CaixaRequestError && error.status === 401) {
        expire()
      } else if (error instanceof CaixaRequestError && error.status >= 400 && error.status < 500 && error.status !== 403) {
        const linhas = error.body.novaCotacao?.linhas.map((item) => ({
          produtoId: item.produtoId, nome: item.nomeProdutoSnapshot, quantidade: item.quantidade, preco: item.precoUnitarioSnapshot,
        })) ?? draft.linhas
        try {
          save({ ...draft, linhas, tentativa: undefined })
          setError(error.message + (draft.pago ? ' Se o valor já foi recebido, confira com a administração antes de novo lançamento.' : ''))
        } catch {
          setError('Confira a tentativa com a administração.')
        }
        void mutate()
      } else {
        setError('Confirmação inconclusiva. Consulte a mesma tentativa antes de cobrar novamente.')
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function sair() {
    try {
      await requestCaixa('acesso', 'DELETE')
      router.replace('/caixa/login')
    } catch (error) {
      showError(error)
    }
  }

  const total = draft.linhas.reduce((sum, item) => sum + item.preco * item.quantidade, 0)
  const readOnly = Boolean(draft.tentativa) || saving || !ready || !data?.novasVendas
  const produtos = (data?.produtos ?? []).filter((produto) => (produto.nome + ' ' + produto.categoria).toLowerCase().includes(busca.toLowerCase()))
  const atalhos = produtos.filter((produto) => data?.maisVendidos.includes(produto.id)).slice(0, 6)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-3 pb-28 pt-3 sm:px-5 sm:pt-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Caixa Express</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {operacional
            ? <Button variant="outline" onClick={sair}><LogOut data-icon="inline-start" /> Sair</Button>
            : <Button variant="outline" asChild><Link href="/admin">Pedidos</Link></Button>}
        </div>
      </header>
      <Tabs defaultValue={initialNumber && !operacional ? 'gestao' : 'venda'}>
        <TabsList className="mb-2">
          <TabsTrigger value="venda">Nova venda</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
          {!operacional && <TabsTrigger value="gestao">Gerenciar venda</TabsTrigger>}
        </TabsList>
        <TabsContent value="venda">
          {confirmation && <p className="mb-3 rounded-lg border border-success/30 bg-success/10 p-3 font-medium" role="status">{confirmation}</p>}
          {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">{error}</p>}
          {data?.novasVendas === false && <p className="mb-3 rounded-lg border bg-muted p-3 text-sm">Novas vendas desativadas. A aba Pendências continua disponível.</p>}
          {draft.tentativa && !saving && <p className="mb-3 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm">
            Há uma tentativa sem confirmação. Consulte o resultado antes de cobrar novamente.
          </p>}
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] lg:gap-6">
            <section className="grid gap-3" aria-labelledby="caixa-produtos">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="caixa-produtos" className="text-lg font-semibold">Produtos</h2>
                <Input className="min-h-11 w-full sm:w-56" aria-label="Buscar produto" placeholder="Buscar produto" value={busca} onChange={(event) => setBusca(event.target.value)} />
              </div>
              {!data && <p role={catalogError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
                {catalogError ? 'Catálogo indisponível.' : 'Carregando produtos…'}
                {catalogError && <Button variant="link" onClick={() => mutate()}>Tentar novamente</Button>}
              </p>}
              {!busca && atalhos.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Mais vendidos">
                {atalhos.map((produto) => <Button key={produto.id} variant="secondary" className="min-h-11" disabled={readOnly} onClick={() => quantity(produto, 1)}>
                  <Plus /> {produto.nome}
                </Button>)}
              </div>}
              {data && produtos.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum produto disponível para esta busca.</p>}
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {produtos.map((produto) => {
                  const quantidade = draft.linhas.find((item) => item.produtoId === produto.id)?.quantidade ?? 0
                  return <button key={produto.id} type="button" disabled={readOnly || quantidade >= produto.saldo}
                    onClick={() => quantity(produto, 1)}
                    className="min-h-20 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-55 motion-reduce:transition-none">
                    <span className="block text-sm font-semibold">{produto.nome}</span>
                    <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatarMoeda(produto.preco)}</span>
                      <span>{produto.saldo} disponíveis{quantidade > 0 && ' · ' + quantidade + ' na sacola'}</span>
                    </span>
                  </button>
                })}
              </div>
            </section>
            <section className="rounded-xl border bg-card p-3 md:p-4" aria-labelledby="caixa-sacola">
              <h2 id="caixa-sacola" className="mb-2 flex items-center gap-2 text-lg font-semibold"><ShoppingBag className="size-4" /> Sacola</h2>
              {draft.linhas.length === 0 && <p className="py-3 text-sm text-muted-foreground">Adicione um produto para começar.</p>}
              <ul className="divide-y">
                {draft.linhas.map((line) => <li key={line.produtoId} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0 text-sm"><p className="font-medium">{line.quantidade} × {line.nome}</p>
                    <p className="text-muted-foreground">{formatarMoeda(line.quantidade * line.preco)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-11" disabled={readOnly} onClick={() => remove(line)} aria-label={'Remover uma unidade de ' + line.nome}><Minus /></Button>
                </li>)}
              </ul>
              <details className="my-3 border-y py-2" open={draft.pago === false ? true : undefined}>
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">
                  {draft.clienteId ? 'Cliente vinculado' : draft.pago === false ? 'Vincular cliente para receber depois' : 'Cliente balcão'}
                </summary>
                <form onSubmit={(event) => lookup(event, false)} className="grid gap-2">
                  <Label htmlFor="telefone-caixa">Telefone do cliente</Label>
                  <div className="flex gap-2">
                    <Input id="telefone-caixa" type="tel" className="h-11" maxLength={32} value={telefone} disabled={readOnly}
                      onChange={(event) => { setTelefone(event.target.value); setClienteBusca('idle'); setCliente(null) }} required />
                    <Button variant="outline" className="h-11" disabled={readOnly || clienteBusca === 'busy'}>Buscar</Button>
                  </div>
                </form>
                {clienteBusca === 'missing' && <form onSubmit={(event) => lookup(event, true)} className="mt-2 grid gap-2">
                  <Label htmlFor="nome-caixa">Nome para novo cadastro</Label>
                  <Input id="nome-caixa" className="h-11" value={nome} onChange={(event) => setNome(event.target.value)} minLength={2} maxLength={80} required disabled={readOnly} />
                  <Button variant="outline" disabled={readOnly}>Cadastrar</Button>
                </form>}
                {cliente && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{cliente.nome} · {formatPhoneDisplay(cliente.telefone)}</span>
                  {draft.clienteId !== cliente.id && <Button variant="outline" disabled={readOnly} onClick={() => edit({ clienteId: cliente.id })}>Vincular</Button>}
                </div>}
                {draft.clienteId && <Button variant="link" className="px-0" disabled={readOnly} onClick={() => edit({ clienteId: null })}>Remover vínculo</Button>}
              </details>
              <fieldset disabled={readOnly} className="grid grid-cols-2 gap-2">
                <legend className="mb-2 text-sm font-medium">Meio de pagamento</legend>
                {meiosCaixa.map((meio) => {
                  const Icon = icons[meio]
                  return <Button key={meio} type="button" className="min-h-11" variant={draft.meio === meio ? 'default' : 'outline'}
                    aria-pressed={draft.meio === meio} onClick={() => edit({ meio })}><Icon /> {meioCaixaLabel[meio]}</Button>
                })}
              </fieldset>
              <fieldset disabled={readOnly} className="mt-3 flex flex-wrap gap-2">
                <legend className="mb-2 text-sm font-medium">Situação do pagamento</legend>
                <Button className="min-h-11" variant={draft.pago ? 'secondary' : 'outline'} aria-pressed={draft.pago === true} onClick={() => edit({ pago: true })}>Já recebi</Button>
                <Button className="min-h-11" variant={draft.pago === false ? 'secondary' : 'outline'} aria-pressed={draft.pago === false} onClick={() => edit({ pago: false })}>Receber depois</Button>
              </fieldset>
              {draft.pago === false && <p role="status" className="my-3 rounded-lg border border-warning/35 bg-warning/10 p-2 text-sm">A venda dará baixa no estoque e ficará pendente até confirmar o recebimento.</p>}
              <div className="caixa-action fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 border-t bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:static md:mt-3 md:px-0 md:pb-0">
                <div>
                  <a href="#caixa-sacola" className="text-xs font-semibold text-primary underline underline-offset-4 md:hidden">Ver sacola</a>
                  <p className="hidden text-xs text-muted-foreground md:block">Total</p>
                  <p className="text-lg font-bold tabular-nums" aria-label={'Total ' + formatarMoeda(total)}>{formatarMoeda(total)}</p>
                </div>
                <Button className="min-h-11" onClick={concluir}
                  disabled={saving || (!draft.tentativa && (readOnly || !draft.linhas.length || (!draft.pago && !draft.clienteId)))}>
                  {saving ? 'Confirmando…' : draft.tentativa ? 'Consultar tentativa' : 'Concluir venda'}
                </Button>
              </div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="pendencias"><CaixaPendencias storageKey={key + ':baixa'} expire={expire} /></TabsContent>
        {!operacional && <TabsContent value="gestao"><CaixaGestao storageKey={key + ':gestao'} expire={expire} initialNumber={initialNumber} /></TabsContent>}
      </Tabs>
    </main>
  )
}
