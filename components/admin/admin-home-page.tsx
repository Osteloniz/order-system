'use client'

import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, CalendarClock, ChefHat, CirclePlus, ClipboardList, CreditCard, LayoutPanelTop, PackageCheck, ShoppingBag, Store, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { todayInSaoPaulo } from '@/lib/sao-paulo'
import type { Pedido, StatusPedido } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const flow: { status: StatusPedido; label: string; icon: typeof ClipboardList; tone: string }[] = [
  { status: 'FEITO', label: 'Novos', icon: ClipboardList, tone: 'bg-[#C56813]/12 text-[#9A4B0A]' },
  { status: 'ACEITO', label: 'Aceitos', icon: PackageCheck, tone: 'bg-[#559EEE]/12 text-[#2F6FAF]' },
  { status: 'PREPARACAO', label: 'Em preparo', icon: ChefHat, tone: 'bg-[#40631A]/12 text-[#40631A]' },
  { status: 'PRONTO_ENTREGA', label: 'Prontos', icon: ShoppingBag, tone: 'bg-success/12 text-success' },
]

export function AdminHomePage() {
  const date = todayInSaoPaulo()
  const { data: pedidos, isLoading } = useSWR<Pedido[]>(`/api/admin/pedidos?date=${date}&carryoverNovos=1`, fetcher, { refreshInterval: 10000 })
  const safePedidos = Array.isArray(pedidos) ? pedidos : []
  const activePedidos = safePedidos.filter((pedido) => pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO')
  const pendingPayments = activePedidos.filter((pedido) => pedido.statusPagamento === 'PENDENTE').length
  const encomendas = activePedidos.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA').length

  const stats = [
    { label: 'Novos', value: safePedidos.filter((pedido) => pedido.status === 'FEITO').length, icon: ClipboardList, tone: 'text-[#C56813] bg-[#C56813]/10' },
    { label: 'Em andamento', value: safePedidos.filter((pedido) => pedido.status === 'ACEITO' || pedido.status === 'PREPARACAO').length, icon: ChefHat, tone: 'text-[#40631A] bg-[#40631A]/10' },
    { label: 'Prontos', value: safePedidos.filter((pedido) => pedido.status === 'PRONTO_ENTREGA').length, icon: PackageCheck, tone: 'text-success bg-success/10' },
    { label: 'Pagamentos', value: pendingPayments, icon: CreditCard, tone: 'text-[#559EEE] bg-[#559EEE]/10' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-[#E7DBB3] bg-[#E7DBB3] text-[#421C14] shadow-sm dark:border-[#421C14] dark:bg-[#421C14] dark:text-[#E7DBB3]">
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#C56813]/16" aria-hidden="true" />
        <div className="relative grid min-h-[188px] grid-cols-[minmax(0,1fr)_112px] items-center gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:p-5 md:min-h-[220px]">
          <div className="min-w-0">
            <Badge className="mb-3 border-0 bg-[#40631A] text-[#E7DBB3] hover:bg-[#40631A]">Central Brookie</Badge>
            <h1 className="max-w-xl text-2xl font-bold leading-tight sm:text-3xl">Tudo da operação em um só lugar.</h1>
            <p className="mt-2 max-w-lg text-sm text-[#421C14]/72 dark:text-[#E7DBB3]/72">Pedidos, produção, clientes e financeiro organizados para a rotina da Brookie Pregiato.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-9 rounded-lg bg-[#40631A] text-[#E7DBB3] hover:bg-[#365416]">
                <Link href="/admin/novo-pedido"><CirclePlus className="h-4 w-4" />Nova venda</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg border-[#421C14]/20 bg-white/35 text-[#421C14] hover:bg-white/55 dark:border-[#E7DBB3]/25 dark:bg-white/5 dark:text-[#E7DBB3]">
                <Link href="/admin">Ver pedidos<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-full border border-[#421C14]/10 bg-[#E7DBB3] shadow-sm dark:hidden">
            <Image src="/brand/brookie-logo-light.jpg" alt="Logo Brookie Pregiato" fill priority sizes="(max-width: 640px) 112px, 180px" className="object-cover" />
          </div>
          <div className="relative hidden aspect-square w-full overflow-hidden rounded-full border border-[#E7DBB3]/15 bg-[#421C14] shadow-sm dark:block">
            <Image src="/brand/brookie-logo-dark.jpg" alt="Logo Brookie Pregiato" fill priority sizes="(max-width: 640px) 112px, 180px" className="object-cover" />
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
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#C56813]/8 px-3 py-2 text-xs text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0 text-[#C56813]" />
              <span><strong className="text-foreground">{encomendas}</strong> encomenda(s) aberta(s) na agenda.</span>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border/70 bg-card p-3" aria-labelledby="atalhos">
          <h2 id="atalhos" className="mb-2 font-semibold">Acesso rápido</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/admin/novo-pedido', label: 'Nova venda', detail: 'Lançar pedido', icon: CirclePlus, color: 'text-[#40631A]' },
              { href: '/admin/kds', label: 'KDS', detail: 'Acompanhar produção', icon: LayoutPanelTop, color: 'text-[#C56813]' },
              { href: '/admin/clientes', label: 'Clientes', detail: 'Buscar cadastro', icon: Users, color: 'text-[#559EEE]' },
              { href: '/admin/estoque', label: 'Estoque', detail: 'Saldo e produção', icon: Store, color: 'text-[#421C14]' },
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
    </div>
  )
}
