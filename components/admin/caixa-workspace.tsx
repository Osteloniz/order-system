'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Banknote, Check, ChevronDown, Clock3, CreditCard, Flame, LogOut, Minus, NotebookPen, Plus, ScanLine, Search, ShoppingBag, UserRound } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/theme-toggle'
import { formatarMoeda } from '@/lib/calc'
import { CAIXA_IDLE_MS } from '@/lib/caixa-session-policy'
import { LIMITE_OBSERVACAO_CAIXA, meiosCaixa, meioCaixaLabel, type MeioCaixa, type VendaCaixa } from '@/lib/caixa-contract'
import { CaixaRequestError, hashCotacao, requestCaixa, type ClienteCaixa, type LinhaCaixa, type ProdutoCaixa } from '@/components/admin/caixa-client'
import { CaixaPendencias } from '@/components/admin/caixa-pendencias'
import { CaixaCustomerPicker } from '@/components/admin/caixa-customer-picker'
import { CaixaGestao } from '@/components/admin/caixa-gestao'

const icons = { PIX: ScanLine, CREDITO: CreditCard, DEBITO: CreditCard, DINHEIRO: Banknote }
type Catalogo = { produtos: ProdutoCaixa[]; maisVendidos: string[]; novasVendas: boolean }
type Draft = { linhas: LinhaCaixa[]; clienteId: string | null; meio: MeioCaixa; pago: boolean | null; observacao?: string; tentativa?: VendaCaixa }

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
  const [pickerKey, setPickerKey] = useState(0)
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

  const faltaClienteParaPendencia = draft.pago === false && (!draft.clienteId ||
    (cliente?.id === draft.clienteId && !cliente.telefoneFinal))

  async function concluir() {
    if (!ready || inFlight.current) return
    if (!draft.tentativa && (!data?.novasVendas || !draft.linhas.length || draft.pago === null || faltaClienteParaPendencia)) return
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const tentativa = draft.tentativa ?? {
        clienteId: draft.clienteId, pago: draft.pago === true, meio: draft.meio, tentativa: crypto.randomUUID(),
        itens: draft.linhas.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
        cotacao: await hashCotacao(draft.linhas), observacao: draft.observacao?.trim() || undefined,
      }
      save({ ...draft, tentativa })
      const venda = await requestCaixa<{ numero: string }>('vendas', 'POST', tentativa)
      save(initial)
      setConfirmation('Venda #' + venda.numero + ' concluída.')
      setCliente(null)
      setPickerKey((version) => version + 1)
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

  const quantidadeNaSacola = draft.linhas.reduce((sum, item) => sum + item.quantidade, 0)
  const total = draft.linhas.reduce((sum, item) => sum + item.preco * item.quantidade, 0)
  const readOnly = Boolean(draft.tentativa) || saving || !ready || !data?.novasVendas
  const produtos = (data?.produtos ?? []).filter((produto) => (produto.nome + ' ' + produto.categoria).toLowerCase().includes(busca.toLowerCase()))
  const atalhos = (data?.maisVendidos ?? []).flatMap((id) => {
    const produto = produtos.find((item) => item.id === id)
    return produto ? [produto] : []
  }).slice(0, 6)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-3 pb-28 pt-3 sm:px-5">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border bg-card p-2.5 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/brand/brookie-mark-color.jpg" width={36} height={36} alt="" priority
            className="size-9 shrink-0 rounded-full border border-border object-cover" />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Caixa Express</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {operacional
            ? <Button variant="outline" onClick={sair}><LogOut data-icon="inline-start" /> Sair</Button>
            : <Button variant="outline" asChild><Link href="/admin">Pedidos</Link></Button>}
        </div>
      </header>
      <Tabs defaultValue={initialNumber && !operacional ? 'gestao' : 'venda'}>
        <TabsList className="mb-3 h-auto max-w-full flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
          <TabsTrigger value="venda" className="min-h-10"><ShoppingBag aria-hidden="true" />Nova venda</TabsTrigger>
          <TabsTrigger value="pendencias" className="min-h-10"><Clock3 aria-hidden="true" />Pendências</TabsTrigger>
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
            <section className="grid min-w-0 gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4" aria-labelledby="caixa-produtos">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="caixa-produtos" className="text-lg font-semibold">Produtos</h2>
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input className="min-h-11 bg-background pl-9" aria-label="Buscar produto" placeholder="Buscar produto"
                    value={busca} onChange={(event) => setBusca(event.target.value)} />
                </div>
              </div>
              {!data && <p role={catalogError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
                {catalogError ? 'Catálogo indisponível.' : 'Carregando produtos…'}
                {catalogError && <Button variant="link" onClick={() => mutate()}>Tentar novamente</Button>}
              </p>}
              {!busca && atalhos.length > 0 && <section className="grid gap-2 rounded-xl border border-border/70 bg-secondary/35 p-2" aria-labelledby="caixa-mais-vendidos">
                <h3 id="caixa-mais-vendidos" className="flex items-center gap-1.5 px-0.5 text-sm font-semibold">
                  <Flame className="size-4 text-primary" aria-hidden="true" />Mais vendidos
                </h3>
                <div className="flex flex-wrap gap-2">
                  {atalhos.map((produto) => <Button key={produto.id} variant="outline" className="min-h-11 max-w-full whitespace-normal rounded-full bg-card text-left"
                    disabled={readOnly || (draft.linhas.find((linha) => linha.produtoId === produto.id)?.quantidade ?? 0) >= produto.saldo}
                    aria-label={'Adicionar ' + produto.nome} onClick={() => quantity(produto, 1)}>
                    <Plus aria-hidden="true" /> {produto.nome}
                  </Button>)}
                </div>
              </section>}
              {data && produtos.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum produto disponível para esta busca.</p>}
              <div className="grid grid-cols-2 gap-2">
                {produtos.map((produto) => {
                  const quantidade = draft.linhas.find((item) => item.produtoId === produto.id)?.quantidade ?? 0
                  return <button key={produto.id} type="button" disabled={readOnly || quantidade >= produto.saldo}
                    onClick={() => quantity(produto, 1)}
                    className="group grid min-h-20 grid-rows-[1fr_auto] gap-1.5 rounded-xl border bg-background p-2.5 text-left transition-colors hover:border-primary/65 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-55 motion-reduce:transition-none">
                    <span className="min-w-0 break-words text-sm font-semibold leading-tight">{produto.nome}</span>
                    <span className="flex items-end justify-between gap-1">
                      <span className="grid gap-0.5">
                        <span className="font-bold tabular-nums text-primary">{formatarMoeda(produto.preco)}</span>
                        <span className="text-xs text-muted-foreground">{produto.saldo} disponíveis{quantidade > 0 && ' · ' + quantidade + ' na sacola'}</span>
                      </span>
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden="true">
                        <Plus className="size-4" />
                      </span>
                    </span>
                  </button>
                })}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4" aria-labelledby="caixa-sacola">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="caixa-sacola" className="flex items-center gap-2 text-lg font-bold">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><ShoppingBag className="size-4" aria-hidden="true" /></span>
                  Sacola
                </h2>
                {quantidadeNaSacola > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
                  {quantidadeNaSacola} {quantidadeNaSacola === 1 ? 'item' : 'itens'}
                </span>}
              </div>
              {draft.linhas.length === 0 && <p className="rounded-xl border border-dashed bg-background p-3 text-sm text-muted-foreground">Adicione um produto para começar.</p>}
              <ul className="divide-y">
                {draft.linhas.map((line) => <li key={line.produtoId} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0 text-sm"><p className="font-medium">{line.quantidade} × {line.nome}</p>
                    <p className="text-muted-foreground">{formatarMoeda(line.quantidade * line.preco)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-11" disabled={readOnly} onClick={() => remove(line)} aria-label={'Remover uma unidade de ' + line.nome}><Minus /></Button>
                </li>)}
              </ul>
              <details className="group mt-3 rounded-xl border bg-background px-2.5" open={draft.pago === false ? true : undefined}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {draft.clienteId ? (cliente?.id === draft.clienteId ? cliente.nome : 'Cliente vinculado')
                    : draft.pago === false ? 'Vincular cliente para receber depois' : 'Cliente balcão · Fidelidade'}
                  <ChevronDown className="ml-auto size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-border/60 py-2.5">
                {draft.clienteId
                  ? <>
                    {faltaClienteParaPendencia && <p className="text-sm text-muted-foreground">Escolha um cliente com telefone válido para receber depois.</p>}
                    <Button variant="link" className="px-0" disabled={readOnly} onClick={() => edit({ clienteId: null })}>Remover vínculo</Button>
                  </>
                  : <>
                    {draft.pago !== false && <p className="mb-2 text-sm text-muted-foreground">Vincule um cliente para acumular na fidelidade. Você também pode seguir como cliente balcão.</p>}
                    <CaixaCustomerPicker key={pickerKey} allowCreate requirePhone={draft.pago === false} disabled={readOnly} onExpire={expire}
                      onSelect={(selected) => { edit({ clienteId: selected.id }); setCliente(selected) }} />
                  </>}
                </div>
              </details>
              <details key={pickerKey} className="group mb-4 mt-2 rounded-xl border bg-background px-2.5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <NotebookPen className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {draft.observacao?.trim() ? 'Observação da venda' : 'Adicionar observação'}
                  <ChevronDown className="ml-auto size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <Textarea value={draft.observacao ?? ''} disabled={readOnly} maxLength={LIMITE_OBSERVACAO_CAIXA}
                  className="mb-2 bg-card" aria-label="Observação da venda" rows={2} onChange={(event) => edit({ observacao: event.target.value })} />
              </details>
              <fieldset disabled={readOnly} className="grid grid-cols-2 gap-2">
                <legend className="mb-2 text-sm font-medium">Meio de pagamento</legend>
                {meiosCaixa.map((meio) => {
                  const Icon = icons[meio]
                  return <Button key={meio} type="button" className="min-h-12 justify-start rounded-xl px-2.5" variant={draft.meio === meio ? 'default' : 'outline'}
                    aria-pressed={draft.meio === meio} onClick={() => edit({ meio })}>
                    <Icon aria-hidden="true" /> {meioCaixaLabel[meio]}
                    {draft.meio === meio && <Check className="ml-auto" aria-hidden="true" />}
                  </Button>
                })}
              </fieldset>
              <fieldset disabled={readOnly} className="mt-3 flex flex-wrap gap-2">
                <legend className="mb-2 text-sm font-medium">Situação do pagamento</legend>
                <Button className="min-h-11" variant={draft.pago ? 'secondary' : 'outline'} aria-pressed={draft.pago === true} onClick={() => edit({ pago: true })}>Já recebi</Button>
                <Button className="min-h-11" variant={draft.pago === false ? 'secondary' : 'outline'} aria-pressed={draft.pago === false} onClick={() => edit({ pago: false })}>Receber depois</Button>
              </fieldset>
              {draft.pago === false && <p role="status" className="my-3 rounded-lg border border-warning/35 bg-warning/10 p-2 text-sm">A venda dará baixa no estoque e ficará pendente até confirmar o recebimento.</p>}
              <div className="caixa-action fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 border-t bg-card px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-7px_24px_-12px_var(--foreground)] md:static md:mt-4 md:rounded-xl md:border md:bg-secondary/40 md:p-3 md:shadow-none">
                <div>
                  <a href="#caixa-sacola" className="text-xs font-semibold text-primary underline underline-offset-4 md:hidden">Ver sacola</a>
                  <p className="hidden text-xs text-muted-foreground md:block">Total</p>
                  <p className="text-lg font-bold tabular-nums" aria-label={'Total ' + formatarMoeda(total)}>{formatarMoeda(total)}</p>
                </div>
                <Button className="min-h-11" onClick={concluir}
                  disabled={saving || (!draft.tentativa && (readOnly || !draft.linhas.length || draft.pago === null || faltaClienteParaPendencia))}>
                  {saving ? 'Confirmando…' : draft.tentativa ? 'Consultar tentativa' : 'Concluir venda'}
                  {!saving && <ArrowRight aria-hidden="true" />}
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
