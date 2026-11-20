'use client'

import { useState } from 'react'
import { InternalThemeArtwork } from '@/components/admin/internal-theme'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, CalendarClock, ChefHat, CirclePlus, ClipboardList, CreditCard, Gift, LayoutPanelTop, LoaderCircle, PackageCheck, RefreshCw, ShoppingBag, Store, UserRound, Users } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarTelefone } from '@/lib/calc'
import { MIMO_COOKIE_THRESHOLD } from '@/lib/mimos'
import { todayInSaoPaulo } from '@/lib/sao-paulo'
import type { Pedido, StatusPedido } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar dados')
  return data
}

type ClienteFidelidadeHome = {
  id: string
  nome: string
  telefone: string | null
  whatsapp: string | null
  totalCookies: number
  ultimoPedidoEm: string | null
  resumoFidelidade: {
    totalMimosGerados: number
    mimosEntregues: number
    mimosDisponiveis: number
    progressoAtual: number
    faltamParaProximo: number
  }
}

type FidelidadeHomeResponse = {
  resumo: {
    clientesAcompanhados: number
    clientesComMimo: number
    mimosDisponiveis: number
  }
  clientes: ClienteFidelidadeHome[]
}

const flow: { status: StatusPedido; label: string; icon: typeof ClipboardList; tone: string }[] = [
  { status: 'FEITO', label: 'Novos', icon: ClipboardList, tone: 'bg-warning/12 text-muted-foreground' },
  { status: 'ACEITO', label: 'Aceitos', icon: PackageCheck, tone: 'bg-info/12 text-info' },
  { status: 'PREPARACAO', label: 'Em preparo', icon: ChefHat, tone: 'bg-primary/12 text-primary' },
  { status: 'PRONTO_ENTREGA', label: 'Prontos', icon: ShoppingBag, tone: 'bg-success/12 text-success' },
]

export function AdminHomePage() {
  const date = todayInSaoPaulo()
  const { data: pedidos, isLoading } = useSWR<Pedido[]>(`/api/admin/pedidos?date=${date}&carryoverNovos=1`, fetcher, { refreshInterval: 10000 })
  const {
    data: fidelidade,
    error: fidelidadeError,
    isLoading: isLoadingFidelidade,
    mutate: mutateFidelidade,
  } = useSWR<FidelidadeHomeResponse>('/api/admin/clientes/fidelidade', fetcher, { refreshInterval: 30000 })
  const [clienteMimo, setClienteMimo] = useState<ClienteFidelidadeHome | null>(null)
  const [deliveringMimo, setDeliveringMimo] = useState(false)
  const [fidelidadeMessage, setFidelidadeMessage] = useState('')
  const [deliveryError, setDeliveryError] = useState('')
  const safePedidos = Array.isArray(pedidos) ? pedidos : []
  const activePedidos = safePedidos.filter((pedido) => pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO')
  const pendingPayments = activePedidos.filter((pedido) => pedido.statusPagamento === 'PENDENTE').length
  const encomendas = activePedidos.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA').length

  const stats = [
    { label: 'Novos', value: safePedidos.filter((pedido) => pedido.status === 'FEITO').length, icon: ClipboardList, tone: 'text-foreground bg-warning/10' },
    { label: 'Em andamento', value: safePedidos.filter((pedido) => pedido.status === 'ACEITO' || pedido.status === 'PREPARACAO').length, icon: ChefHat, tone: 'text-primary bg-primary/10' },
    { label: 'Prontos', value: safePedidos.filter((pedido) => pedido.status === 'PRONTO_ENTREGA').length, icon: PackageCheck, tone: 'text-success bg-success/10' },
    { label: 'Pagamentos', value: pendingPayments, icon: CreditCard, tone: 'text-info bg-info/10' },
  ]

  const confirmarMimo = (cliente: ClienteFidelidadeHome) => {
    setDeliveryError('')
    setClienteMimo(cliente)
  }

  const marcarMimoEntregue = async () => {
    if (!clienteMimo) return

    setDeliveringMimo(true)
    setDeliveryError('')
    setFidelidadeMessage('')

    try {
      const response = await fetch(`/api/admin/clientes/${clienteMimo.id}/mimo`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao registrar mimo entregue')

      await mutateFidelidade()
      setFidelidadeMessage(`Mimo de ${clienteMimo.nome} registrado como entregue.`)
      setClienteMimo(null)
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Erro ao registrar mimo entregue')
    } finally {
      setDeliveringMimo(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-secondary text-secondary-foreground shadow-sm">
        <div className="relative grid min-h-[188px] grid-cols-[minmax(0,1fr)_112px] items-center gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:p-5 md:min-h-[220px]">
          <div className="min-w-0">
            <h1 className="max-w-xl text-2xl font-bold leading-tight sm:text-3xl">Operação de hoje</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href="/caixa"><CirclePlus className="h-4 w-4" />Caixa Express</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg border-border bg-background">
                <Link href="/admin">Ver pedidos<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="relative aspect-square w-full">
            <InternalThemeArtwork />
          </div>
        </div>
      </section>

      <section aria-labelledby="resumo-hoje">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div>
            <h2 id="resumo-hoje" className="font-semibold">Operação agora</h2>
            <p className="text-xs text-muted-foreground">Pedidos de hoje e pendências ainda abertas.</p>
          </div>
          <Badge variant="outline" className="rounded-md">{activePedidos.length} ativos</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {isLoading ? [1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-[82px] rounded-xl" />) : stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className="gap-0 rounded-xl border-border/70 py-0">
                <CardContent className="flex items-center gap-3 p-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.tone}`}><Icon className="h-4 w-4" /></span>
                  <div><p className="text-xl font-bold leading-none">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.label}</p></div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-border/70 bg-card p-3" aria-labelledby="fluxo-pedidos">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="fluxo-pedidos" className="font-semibold">Fases dos pedidos</h2>
            <Link href="/admin" className="text-xs font-medium text-primary hover:underline">Abrir lista</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {flow.map((item) => {
              const Icon = item.icon
              const count = safePedidos.filter((pedido) => pedido.status === item.status).length
              return (
                <Link key={item.status} href="/admin" className="rounded-lg border border-border/60 bg-background/60 p-2.5 transition-colors hover:border-primary/35 hover:bg-primary/[0.03]">
                  <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md ${item.tone}`}><Icon className="h-3.5 w-3.5" /></span>
                  <p className="text-lg font-bold leading-none">{count}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                </Link>
              )
            })}
          </div>
          {encomendas > 0 ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0 text-foreground" />
              <span><strong className="text-foreground">{encomendas}</strong> encomenda(s) aberta(s) na agenda.</span>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border/70 bg-card p-3" aria-labelledby="atalhos">
          <h2 id="atalhos" className="mb-2 font-semibold">Acesso rápido</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/admin/novo-pedido', label: 'Nova venda', detail: 'Lançar pedido', icon: CirclePlus, color: 'text-primary' },
              { href: '/admin/kds', label: 'KDS', detail: 'Acompanhar produção', icon: LayoutPanelTop, color: 'text-foreground' },
              { href: '/admin/clientes', label: 'Clientes', detail: 'Buscar cadastro', icon: Users, color: 'text-info' },
              { href: '/admin/estoque', label: 'Estoque', detail: 'Saldo e produção', icon: Store, color: 'text-foreground' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="flex min-h-[72px] items-start gap-2.5 rounded-lg border border-border/60 bg-background/60 p-2.5 transition-colors hover:border-primary/35 hover:bg-primary/[0.03]">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.color}`} />
                  <div className="min-w-0"><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{item.detail}</p></div>
                </Link>
              )
            })}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card" aria-labelledby="fidelidade-clientes">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-foreground"><Gift className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h2 id="fidelidade-clientes" className="font-semibold">Fidelidade em destaque</h2>
              <p className="text-xs text-muted-foreground">Mimos liberados primeiro, seguidos por quem está mais perto.</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 rounded-lg px-2 text-xs">
            <Link href="/admin/clientes">Ver clientes<ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>

        <div className="p-3">
          {fidelidadeMessage ? <p aria-live="polite" className="mb-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">{fidelidadeMessage}</p> : null}

          {isLoadingFidelidade ? (
            <div className="grid gap-2 lg:grid-cols-2"><Skeleton className="h-[92px] rounded-lg" /><Skeleton className="h-[92px] rounded-lg" /></div>
          ) : fidelidadeError ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5">
              <p className="text-xs text-destructive">Não foi possível carregar a fidelidade agora.</p>
              <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-md px-2 text-[11px]" onClick={() => mutateFidelidade()}>
                <RefreshCw className="h-3.5 w-3.5" />Tentar novamente
              </Button>
            </div>
          ) : fidelidade?.clientes.length ? (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge className="border-0 bg-primary/12 text-primary hover:bg-primary/12">{fidelidade.resumo.mimosDisponiveis} mimo(s) disponível(is)</Badge>
                <Badge variant="outline">{fidelidade.resumo.clientesComMimo} cliente(s) para presentear</Badge>
                <Badge variant="outline">{fidelidade.resumo.clientesAcompanhados} em acompanhamento</Badge>
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {fidelidade.clientes.map((cliente) => {
                  const mimoDisponivel = cliente.resumoFidelidade.mimosDisponiveis > 0
                  const progresso = mimoDisponivel
                    ? 100
                    : Math.round((cliente.resumoFidelidade.progressoAtual / MIMO_COOKIE_THRESHOLD) * 100)

                  return (
                    <article key={cliente.id} className={`rounded-lg border p-2.5 ${mimoDisponivel ? 'border-primary/30 bg-primary/[0.045]' : 'border-border/60 bg-background/60'}`}>
                      <div className="flex items-start gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mimoDisponivel ? 'bg-primary text-primary-foreground' : 'bg-warning/10 text-foreground'}`}>
                          {mimoDisponivel ? <Gift className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{cliente.nome}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{cliente.telefone || cliente.whatsapp ? formatarTelefone(cliente.telefone || cliente.whatsapp || '') : `${cliente.totalCookies} cookies comprados`}</p>
                            </div>
                            <Badge variant={mimoDisponivel ? 'default' : 'outline'} className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
                              {mimoDisponivel ? `${cliente.resumoFidelidade.mimosDisponiveis} mimo(s)` : `Faltam ${cliente.resumoFidelidade.faltamParaProximo}`}
                            </Badge>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={progresso} className="h-1.5 flex-1" />
                            <span className="shrink-0 text-[10px] text-muted-foreground">{mimoDisponivel ? 'Liberado' : `${cliente.resumoFidelidade.progressoAtual}/${MIMO_COOKIE_THRESHOLD}`}</span>
                          </div>

                          <div className="mt-2 flex items-center gap-1.5">
                            <Button asChild variant="outline" size="sm" className="h-7 flex-1 rounded-md px-2 text-[11px]">
                              <Link href={`/admin/clientes?cliente=${encodeURIComponent(cliente.id)}`}>Abrir cadastro</Link>
                            </Button>
                            {mimoDisponivel ? (
                              <Button size="sm" className="h-7 flex-1 rounded-md px-2 text-[11px]" onClick={() => confirmarMimo(cliente)}>
                                <Gift className="h-3.5 w-3.5" />Entregar mimo
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center">
              <Gift className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">A fidelidade aparecerá aqui</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Os clientes entram no acompanhamento após a primeira compra vinculada.</p>
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={Boolean(clienteMimo)} onOpenChange={(open) => {
        if (!open && !deliveringMimo) setClienteMimo(null)
      }}>
        <AlertDialogContent className="max-w-md gap-3 rounded-xl p-4">
          <AlertDialogHeader className="gap-1 text-left">
            <AlertDialogTitle className="text-base">Confirmar entrega do mimo?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              A entrega para <strong className="text-foreground">{clienteMimo?.nome}</strong> será registrada e dará baixa de uma unidade do produto de mimo no estoque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deliveryError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">{deliveryError}</p> : null}
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={deliveringMimo} className="h-9 rounded-lg">Cancelar</AlertDialogCancel>
            <Button onClick={marcarMimoEntregue} disabled={deliveringMimo} className="h-9 rounded-lg">
              {deliveringMimo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              Confirmar entrega
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
