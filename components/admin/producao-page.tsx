'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Flame,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useIsMobile } from '@/components/ui/use-mobile'
import { formatarMoeda, formatarHora } from '@/lib/calc'
import { statusPagamentoLabels } from '@/lib/order-display'
import { cn } from '@/lib/utils'
import {
  formatDateInSaoPaulo,
  formatDateTimeInSaoPaulo,
  getCurrentMonthRangeInSaoPaulo,
  todayInSaoPaulo,
} from '@/lib/sao-paulo'
import type { StatusPagamento, StatusPedido, TipoEntrega } from '@/lib/types'

type ProducaoResumoItem = {
  produtoId: string
  nomeProduto: string
  quantidade: number
  receita: number
  pedidos: number
  estoqueDisponivel: number
  estoqueReservado: number
  aProduzir: number
}

type EstoqueItem = {
  produtoId: string
  nomeProduto: string
  categoriaNome: string
  quantidadeDisponivel: number
  quantidadeReservada: number
}

type HistoricoProducaoDia = {
  data: string
  totalProduzido: number
  itens: {
    produtoId: string
    nomeProduto: string
    quantidade: number
  }[]
}

type ProducaoPedido = {
  id: string
  numero: string
  status: StatusPedido
  statusPagamento: StatusPagamento
  clienteNome: string
  clienteBloco?: string | null
  clienteApartamento?: string | null
  tipoEntrega: TipoEntrega
  encomendaPara?: string | null
  total: number
  criadoEm: string
  itens: {
    id: string
    produtoId: string
    nomeProduto: string
    quantidade: number
    quantidadePreparada: number
    preparadoEm?: string | null
    totalItem: number
  }[]
}

type ProducaoData = {
  from: string
  to: string
  totalPedidos: number
  totalItens: number
  totalAProduzir: number
  totalEncomendasAProduzir: number
  receitaTotal: number
  resumo: ProducaoResumoItem[]
  aProduzir: ProducaoResumoItem[]
  encomendasAProduzir: ProducaoResumoItem[]
  estoque: EstoqueItem[]
  historicoProducao: HistoricoProducaoDia[]
  pedidos: ProducaoPedido[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar producao')
  return data
}

export function ProducaoPage() {
  const isMobile = useIsMobile()
  const today = todayInSaoPaulo()
  const defaultRange = getCurrentMonthRangeInSaoPaulo()
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [productionDate, setProductionDate] = useState(today)
  const [productionDrafts, setProductionDrafts] = useState<Record<string, string>>({})
  const [savingProductionId, setSavingProductionId] = useState<string | null>(null)
  const [markingItemId, setMarkingItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const url = useMemo(() => `/api/admin/producao?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<ProducaoData>(url, fetcher, {
    refreshInterval: 15000,
  })

  useEffect(() => {
    if (!data?.estoque) return
    setProductionDrafts((current) =>
      Object.fromEntries(data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? ''])),
    )
  }, [data?.estoque])

  const encomendas = useMemo(
    () => data?.pedidos.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA') ?? [],
    [data],
  )
  const pedidosNormais = useMemo(
    () => data?.pedidos.filter((pedido) => pedido.tipoEntrega !== 'ENCOMENDA') ?? [],
    [data],
  )
  const productionDateLabel = formatDateInSaoPaulo(productionDate)
  const resumoCards = [
    {
      title: 'Pedidos no periodo',
      value: data?.totalPedidos ?? 0,
      detail: 'Movimento monitorado no recorte atual.',
      tone: 'border-primary/25 bg-primary/10',
      icon: ReceiptText,
      iconClassName: 'text-primary',
    },
    {
      title: 'Unidades pedidas',
      value: data?.totalItens ?? 0,
      detail: 'Volume total para produzir e separar.',
      tone: 'border-secondary/25 bg-secondary/10',
      icon: PackageCheck,
      iconClassName: 'text-secondary',
    },
    {
      title: 'Novos sem estoque',
      value: data?.totalAProduzir ?? 0,
      detail: 'Pedidos imediatos aguardando producao.',
      tone: 'border-warning/35 bg-warning/15',
      icon: Flame,
      iconClassName: 'text-warning-foreground',
    },
    {
      title: 'Encomendas a reservar',
      value: data?.totalEncomendasAProduzir ?? 0,
      detail: 'Reserva pendente para pedidos futuros.',
      tone: 'border-accent/45 bg-accent/40',
      icon: CalendarDays,
      iconClassName: 'text-secondary',
    },
  ]

  const recordProduction = async (produtoId: string) => {
    const quantidade = Number(productionDrafts[produtoId] ?? 0)
    if (!Number.isFinite(quantidade) || quantidade <= 0) return

    setSavingProductionId(produtoId)
    setMessage('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD_PRODUCTION',
          produtoId,
          quantidade: Math.floor(quantidade),
          dataProducao: productionDate,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao registrar producao')
      setProductionDrafts((current) => ({ ...current, [produtoId]: '' }))
      setMessage('Producao registrada e estoque atualizado.')
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao registrar producao')
    } finally {
      setSavingProductionId(null)
    }
  }

  const markPrepared = async (itemPedidoId: string, prepared: boolean) => {
    setMarkingItemId(itemPedidoId)
    setMessage('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MARK_ITEM_PREPARED', itemPedidoId, prepared }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao marcar producao')
      setMessage(prepared ? 'Encomenda reservada no estoque.' : 'Reserva da encomenda desfeita.')
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao marcar producao')
    } finally {
      setMarkingItemId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/70 bg-gradient-to-br from-primary/16 via-card to-secondary/14 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ChefHat className="h-3.5 w-3.5" />
              Operacao de producao
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                <ChefHat className="h-6 w-6 text-primary" />
                Producao
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Registre a producao do dia, acompanhe o estoque real e reserve encomendas sem perder o controle.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                {data?.totalPedidos ?? 0} pedidos
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {data?.totalItens ?? 0} unidades
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                Data operacional {productionDateLabel}
              </Badge>
            </div>
          </div>

          <div className="rounded-[22px] border border-border/70 bg-background/82 p-4 shadow-sm xl:min-w-[560px]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_160px_170px_auto] xl:items-end">
              <div className="space-y-2">
                <Label htmlFor="data-producao-inicio">De</Label>
                <Input
                  id="data-producao-inicio"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-producao-fim">Ate</Label>
                <Input
                  id="data-producao-fim"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-registro-producao">Data produzida</Label>
                <Input
                  id="data-registro-producao"
                  type="date"
                  value={productionDate}
                  onChange={(event) => setProductionDate(event.target.value)}
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => mutate()} className="h-11 rounded-2xl">
                  <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Use essa data para registrar hoje uma producao que vai contar como {productionDateLabel}.
            </p>
            {isMobile ? (
              <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Primeiro confira os faltantes logo abaixo. Depois use os cards por sabor para registrar a entrada no estoque.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {resumoCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.title} className={cn(card.tone, 'gap-0 rounded-[24px] border shadow-sm')}>
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                    <div className="rounded-2xl border border-background/50 bg-background/55 p-2">
                      <Icon className={cn('h-4 w-4', card.iconClassName)} />
                    </div>
                  </div>
                  <p className="text-3xl font-semibold tracking-tight">{card.value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card className="border-primary/35 bg-primary/5">
          <CardHeader>
            <CardTitle>Pedidos novos aguardando estoque</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : data?.aProduzir.length ? (
              <div className="space-y-3">
                {data.aProduzir.map((item) => (
                  <div
                    key={item.produtoId}
                    className="rounded-[22px] border border-primary/15 bg-background/90 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.nomeProduto}</p>
                        <p className="text-sm text-muted-foreground">
                          Pedidos novos {item.quantidade} • Estoque livre {item.estoqueDisponivel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">{item.aProduzir}</p>
                        <p className="text-xs text-muted-foreground">produzir</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nao ha falta de estoque para pedidos novos neste periodo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-secondary/35 bg-secondary/8">
          <CardHeader>
            <CardTitle>Encomendas pendentes de reserva</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : data?.encomendasAProduzir.length ? (
              <div className="space-y-3">
                {data.encomendasAProduzir.map((item) => (
                  <div
                    key={item.produtoId}
                    className="flex flex-col gap-3 rounded-[22px] border border-secondary/15 bg-background/90 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.nomeProduto}</p>
                      <p className="text-sm text-muted-foreground">
                        Falta reservar para encomendas abertas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-secondary">{item.aProduzir}</p>
                      <p className="text-xs text-muted-foreground">reservar</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma encomenda pendente de preparo no periodo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          <CardTitle>Estoque e entrada de producao</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada card mostra o saldo livre do sabor e permite registrar producao com menos toques no celular.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : data?.estoque.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.estoque.map((item) => (
                <div key={item.produtoId} className="rounded-[24px] border border-border/70 bg-card/98 p-4 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.nomeProduto}</p>
                      <p className="text-sm text-muted-foreground">{item.categoriaNome}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Disponivel {item.quantidadeDisponivel}</Badge>
                      <Badge variant="secondary">Reservado {item.quantidadeReservada}</Badge>
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Disponivel agora
                      </p>
                      <p className="mt-2 text-xl font-bold text-primary">{item.quantidadeDisponivel}</p>
                    </div>
                    <div className="rounded-2xl border border-warning/35 bg-warning/15 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Reservado encomendas
                      </p>
                      <p className="mt-2 text-xl font-bold">{item.quantidadeReservada}</p>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-border/70 bg-background/80 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <ChefHat className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Registrar producao</p>
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Soma novas unidades ao estoque usando a data operacional {productionDateLabel}.
                    </p>
                    <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Produzidos"
                        value={productionDrafts[item.produtoId] ?? ''}
                        onChange={(event) =>
                          setProductionDrafts((current) => ({
                            ...current,
                            [item.produtoId]: event.target.value,
                          }))
                        }
                        className="h-11 rounded-2xl"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full rounded-2xl sm:w-auto"
                        onClick={() => recordProduction(item.produtoId)}
                        disabled={savingProductionId === item.produtoId}
                      >
                        {savingProductionId === item.produtoId ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {isMobile ? 'Registrar' : `Registrar producao de ${productionDateLabel}`}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Cadastre produtos ativos para controlar estoque.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Historico de producao no periodo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : data?.historicoProducao.length ? (
            <div className="space-y-4">
              {data.historicoProducao.map((dia) => (
                <div key={dia.data} className="rounded-[24px] border border-border/70 p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {new Date(`${dia.data}T12:00:00-03:00`).toLocaleDateString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          dateStyle: 'full',
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Total produzido: {dia.totalProduzido} unidades
                      </p>
                    </div>
                    <Badge variant="secondary">{dia.itens.length} sabores</Badge>
                  </div>
                  <div className="space-y-2">
                    {dia.itens.map((item) => (
                      <div
                        key={`${dia.data}-${item.produtoId}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/25 p-3 text-sm"
                      >
                        <span className="min-w-0 break-words">{item.nomeProduto}</span>
                        <span className="shrink-0 font-semibold">{item.quantidade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma producao registrada nesse periodo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Encomendas do periodo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : encomendas.length ? (
            <div className="space-y-4">
              {encomendas.map((pedido) => (
                <div key={pedido.id} className="rounded-[24px] border border-border/70 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} • {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        Entrega da encomenda: {formatDateTimeInSaoPaulo(pedido.encomendaPara)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                        Encomenda
                      </Badge>
                      <Badge variant="outline">{pedido.status}</Badge>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-2">
                    {pedido.itens.map((item) => {
                      const prepared = item.quantidadePreparada >= item.quantidade
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium">
                              {item.quantidade}x {item.nomeProduto}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {prepared
                                ? 'Produzido e reservado no estoque'
                                : `Falta reservar ${item.quantidade - item.quantidadePreparada}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant={prepared ? 'outline' : 'default'}
                            className="h-11 rounded-2xl"
                            onClick={() => markPrepared(item.id, !prepared)}
                            disabled={markingItemId === item.id}
                          >
                            {markingItemId === item.id ? (
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            {prepared ? 'Desfazer reserva' : 'Reservar no estoque'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma encomenda neste periodo.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Pedidos comuns do periodo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : pedidosNormais.length ? (
            <div className="space-y-4">
              {pedidosNormais.map((pedido) => (
                <div key={pedido.id} className="rounded-[24px] border border-border/70 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} • {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatarHora(pedido.criadoEm)}
                        {pedido.tipoEntrega === 'RESERVA_PAULISTANO' && (
                          <> • Bloco {pedido.clienteBloco} • Apto {pedido.clienteApartamento}</>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{pedido.status}</Badge>
                      <Badge>{statusPagamentoLabels[pedido.statusPagamento]}</Badge>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-1">
                    {pedido.itens.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3 text-sm">
                        <span>{item.quantidade}x {item.nomeProduto}</span>
                        <span className="font-medium">{formatarMoeda(item.totalItem)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido comum neste periodo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
