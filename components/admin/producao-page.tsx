'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CalendarDays, CheckCircle2, ChefHat, Flame, PackageCheck, ReceiptText, RefreshCw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { formatarMoeda, formatarHora } from '@/lib/calc'
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

const statusPagamentoLabels: Record<StatusPagamento, string> = {
  NAO_APLICAVEL: 'Na entrega',
  PENDENTE: 'Pendente',
  APROVADO: 'Pago',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado',
  REEMBOLSADO: 'Reembolsado',
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatarDataHora(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function ProducaoPage() {
  const today = todayInSaoPaulo()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
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
    setProductionDrafts((current) => (
      Object.fromEntries(
        data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? ''])
      )
    ))
  }, [data?.estoque])

  const encomendas = useMemo(() => data?.pedidos.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA') ?? [], [data])
  const pedidosNormais = useMemo(() => data?.pedidos.filter((pedido) => pedido.tipoEntrega !== 'ENCOMENDA') ?? [], [data])

  const recordProduction = async (produtoId: string) => {
    const quantidade = Number(productionDrafts[produtoId] ?? 0)
    if (!Number.isFinite(quantidade) || quantidade <= 0) return

    setSavingProductionId(produtoId)
    setMessage('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD_PRODUCTION', produtoId, quantidade: Math.floor(quantidade), dataProducao: productionDate }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao registrar producao')
      setProductionDrafts((current) => ({ ...current, [produtoId]: '' }))
      setMessage('Producao registrada e estoque atualizado.')
      await mutate()
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao marcar producao')
    } finally {
      setMarkingItemId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ChefHat className="h-6 w-6 text-primary" />
            Produção
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre a producao do dia, acompanhe o estoque real e reserve encomendas sem perder o controle.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_160px_160px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="data-producao-inicio">De</Label>
            <Input id="data-producao-inicio" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="data-producao-fim">Até</Label>
            <Input id="data-producao-fim" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="data-registro-producao">Data produzida</Label>
            <Input id="data-registro-producao" type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-5"><ReceiptText className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Pedidos no período</p><p className="text-2xl font-bold">{data?.totalPedidos ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><PackageCheck className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Unidades pedidas</p><p className="text-2xl font-bold">{data?.totalItens ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><Flame className="mb-3 h-5 w-5 text-[#AF6E2A]" /><p className="text-sm text-muted-foreground">Pedidos novos sem estoque</p><p className="text-2xl font-bold">{data?.totalAProduzir ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><CalendarDays className="mb-3 h-5 w-5 text-[#FF6BBB]" /><p className="text-sm text-muted-foreground">Encomendas para reservar</p><p className="text-2xl font-bold">{data?.totalEncomendasAProduzir ?? 0}</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card className="border-[#22C0D4]/35 bg-[#22C0D4]/5">
          <CardHeader>
            <CardTitle>Pedidos novos aguardando estoque</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            ) : data?.aProduzir.length ? (
              <div className="space-y-3">
                {data.aProduzir.map((item) => (
                  <div key={item.produtoId} className="rounded-xl border bg-background/85 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.nomeProduto}</p>
                        <p className="text-sm text-muted-foreground">Pedidos novos {item.quantidade} · Estoque livre {item.estoqueDisponivel}</p>
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
              <p className="text-sm text-muted-foreground">Nao ha falta de estoque para pedidos novos neste periodo.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#FF6BBB]/35 bg-[#FF6BBB]/5">
          <CardHeader>
            <CardTitle>Encomendas pendentes de reserva</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            ) : data?.encomendasAProduzir.length ? (
              <div className="space-y-3">
                {data.encomendasAProduzir.map((item) => (
                  <div key={item.produtoId} className="flex items-center justify-between gap-4 rounded-xl border bg-background/85 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.nomeProduto}</p>
                      <p className="text-sm text-muted-foreground">Falta reservar para encomendas abertas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#FF6BBB]">{item.aProduzir}</p>
                      <p className="text-xs text-muted-foreground">reservar</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma encomenda pendente de preparo no período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estoque e entrada de producao</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : data?.estoque.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.estoque.map((item) => (
                <div key={item.produtoId} className="rounded-xl border p-4">
                  <div className="mb-3">
                    <p className="font-semibold">{item.nomeProduto}</p>
                    <p className="text-sm text-muted-foreground">{item.categoriaNome}</p>
                  </div>
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/35 p-3">
                      <p className="text-xs text-muted-foreground">Disponivel agora</p>
                      <p className="text-xl font-bold text-primary">{item.quantidadeDisponivel}</p>
                    </div>
                    <div className="rounded-lg bg-muted/35 p-3">
                      <p className="text-xs text-muted-foreground">Reservado encomendas</p>
                      <p className="text-xl font-bold">{item.quantidadeReservada}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_auto]">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Produzidos"
                      value={productionDrafts[item.produtoId] ?? ''}
                      onChange={(event) => setProductionDrafts((current) => ({ ...current, [item.produtoId]: event.target.value }))}
                    />
                    <Button type="button" variant="outline" onClick={() => recordProduction(item.produtoId)} disabled={savingProductionId === item.produtoId}>
                      {savingProductionId === item.produtoId ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Registrar producao
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cadastre produtos ativos para controlar estoque.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historico de producao no periodo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : data?.historicoProducao.length ? (
            <div className="space-y-4">
              {data.historicoProducao.map((dia) => (
                <div key={dia.data} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{new Date(`${dia.data}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' })}</p>
                      <p className="text-sm text-muted-foreground">Total produzido: {dia.totalProduzido} unidades</p>
                    </div>
                    <Badge variant="secondary">{dia.itens.length} sabores</Badge>
                  </div>
                  <div className="space-y-2">
                    {dia.itens.map((item) => (
                      <div key={`${dia.data}-${item.produtoId}`} className="flex items-center justify-between rounded-lg bg-muted/35 p-3 text-sm">
                        <span>{item.nomeProduto}</span>
                        <span className="font-semibold">{item.quantidade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma producao registrada nesse periodo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Encomendas do período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : encomendas.length ? (
            <div className="space-y-4">
              {encomendas.map((pedido) => (
                <div key={pedido.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} · {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">Entrega da encomenda: {formatarDataHora(pedido.encomendaPara)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-[#FF6BBB] text-white hover:bg-[#FF6BBB]">Encomenda</Badge>
                      <Badge variant="outline">{pedido.status}</Badge>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-2">
                    {pedido.itens.map((item) => {
                      const prepared = item.quantidadePreparada >= item.quantidade
                      return (
                        <div key={item.id} className="flex flex-col gap-3 rounded-lg bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium">{item.quantidade}x {item.nomeProduto}</p>
                            <p className="text-sm text-muted-foreground">{prepared ? 'Produzido e reservado no estoque' : `Falta reservar ${item.quantidade - item.quantidadePreparada}`}</p>
                          </div>
                          <Button type="button" variant={prepared ? 'outline' : 'default'} onClick={() => markPrepared(item.id, !prepared)} disabled={markingItemId === item.id}>
                            {markingItemId === item.id ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
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
            <p className="text-sm text-muted-foreground">Nenhuma encomenda neste período.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos comuns do período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : pedidosNormais.length ? (
            <div className="space-y-4">
              {pedidosNormais.map((pedido) => (
                <div key={pedido.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} · {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatarHora(pedido.criadoEm)}
                        {pedido.tipoEntrega === 'RESERVA_PAULISTANO' && <> · Bloco {pedido.clienteBloco} · Apto {pedido.clienteApartamento}</>}
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
            <p className="text-sm text-muted-foreground">Nenhum pedido comum neste período.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
