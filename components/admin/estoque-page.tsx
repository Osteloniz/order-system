'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  AlertTriangle,
  Archive,
  Boxes,
  CalendarDays,
  PackageCheck,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/components/ui/use-mobile'
import { cn } from '@/lib/utils'
import { formatDateInSaoPaulo, formatDateTimeInSaoPaulo, formatLongDateInSaoPaulo, getCurrentMonthRangeInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'

type EstoqueItem = {
  produtoId: string
  nomeProduto: string
  categoriaNome: string
  quantidadeDisponivel: number
  quantidadeReservada: number
  pendenteBaixaLegada: number
  saldoProjetado: number
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

type EstoqueData = {
  from: string
  to: string
  estoque: EstoqueItem[]
  historicoProducao: HistoricoProducaoDia[]
  pedidosLegadosPendentes: number
  pedidosLegadosPendentesLista: {
    id: string
    numero: string
    status: string
    clienteNome: string
    criadoEm: string
    estoqueBaixadoEm: string | null
    totalItens: number
    possuiFaltaNoMomento: boolean
    motivo: string
    itens: {
      produtoId: string
      nomeProduto: string
      quantidade: number
      estoqueDisponivelAtual: number
      estoqueSuficiente: boolean
      saldoAposBaixaItem: number
    }[]
  }[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar estoque')
  return data
}

export function EstoquePage() {
  const isMobile = useIsMobile()
  const today = todayInSaoPaulo()
  const defaultRange = getCurrentMonthRangeInSaoPaulo()
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [productionDate, setProductionDate] = useState(today)
  const [productionDrafts, setProductionDrafts] = useState<Record<string, string>>({})
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [savingProductionId, setSavingProductionId] = useState<string | null>(null)
  const [savingStockId, setSavingStockId] = useState<string | null>(null)
  const [syncingLegacy, setSyncingLegacy] = useState(false)
  const [stockConfirmOpen, setStockConfirmOpen] = useState(false)
  const [stockConfirmProductId, setStockConfirmProductId] = useState<string | null>(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [stockConfirmError, setStockConfirmError] = useState('')
  const [message, setMessage] = useState('')

  const url = useMemo(() => `/api/admin/producao?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<EstoqueData>(url, fetcher, {
    refreshInterval: 15000,
  })

  useEffect(() => {
    if (!data?.estoque) return
    setProductionDrafts((current) => (
      Object.fromEntries(data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? '']))
    ))
    setStockDrafts((current) => (
      Object.fromEntries(
        data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? String(item.quantidadeDisponivel)]),
      )
    ))
  }, [data?.estoque])

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

  const openStockConfirmation = (produtoId: string) => {
    const quantidade = Number(stockDrafts[produtoId] ?? 0)
    if (!Number.isFinite(quantidade) || quantidade < 0) return

    setStockConfirmProductId(produtoId)
    setAdminPassword('')
    setStockConfirmError('')
    setStockConfirmOpen(true)
  }

  const saveStock = async () => {
    if (!stockConfirmProductId) return

    const produtoId = stockConfirmProductId
    const quantidade = Number(stockDrafts[produtoId] ?? 0)
    if (!Number.isFinite(quantidade) || quantidade < 0) return

    setSavingStockId(produtoId)
    setMessage('')
    setStockConfirmError('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SET_STOCK',
          produtoId,
          quantidadeDisponivel: Math.floor(quantidade),
          adminPassword,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao ajustar estoque')
      setMessage('Saldo atual do estoque ajustado.')
      setStockConfirmOpen(false)
      setStockConfirmProductId(null)
      setAdminPassword('')
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao ajustar estoque'
      setStockConfirmError(errorMessage)
      setMessage(errorMessage)
    } finally {
      setSavingStockId(null)
    }
  }

  const syncLegacyStock = async () => {
    setSyncingLegacy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_LEGACY_STOCK' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao sincronizar pedidos antigos')
      const bloqueados = Array.isArray(result.bloqueados) && result.bloqueados.length
        ? ` Bloqueados: ${result.bloqueados.join(', ')}.`
        : ''
      setMessage(
        `Sincronizacao concluida. ${result.sincronizados} pedidos ajustados de ${result.totalPendentes}.${bloqueados}`,
      )
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao sincronizar pedidos antigos')
    } finally {
      setSyncingLegacy(false)
    }
  }

  const selectedStockItem = data?.estoque.find((item) => item.produtoId === stockConfirmProductId) ?? null
  const productionDateLabel = formatDateInSaoPaulo(productionDate)

  const resumo = useMemo(() => {
    const estoque = data?.estoque ?? []
    return {
      produtos: estoque.length,
      disponivel: estoque.reduce((acc, item) => acc + item.quantidadeDisponivel, 0),
      reservado: estoque.reduce((acc, item) => acc + item.quantidadeReservada, 0),
      projetado: estoque.reduce((acc, item) => acc + item.saldoProjetado, 0),
      legado: estoque.reduce((acc, item) => acc + item.pendenteBaixaLegada, 0),
    }
  }, [data?.estoque])

  const cardsResumo = [
    {
      title: 'Produtos monitorados',
      value: resumo.produtos,
      detail: 'Itens ativos com controle de saldo.',
      tone: 'border-primary/25 bg-primary/10',
      icon: Boxes,
      iconClassName: 'text-primary',
    },
    {
      title: 'Disponivel agora',
      value: resumo.disponivel,
      detail: 'Saldo pronto para venda imediata.',
      tone: 'border-secondary/25 bg-secondary/10',
      icon: Archive,
      iconClassName: 'text-secondary',
    },
    {
      title: 'Reservado encomendas',
      value: resumo.reservado,
      detail: 'Volume comprometido em pedidos futuros.',
      tone: 'border-warning/35 bg-warning/15',
      icon: CalendarDays,
      iconClassName: 'text-warning-foreground',
    },
    {
      title: 'Saldo projetado',
      value: resumo.projetado,
      detail: `Baixa legada pendente: ${resumo.legado}`,
      tone: 'border-accent/45 bg-accent/45',
      valueClassName: resumo.projetado < 0 ? 'text-destructive' : 'text-secondary',
      icon: Sparkles,
      iconClassName: resumo.projetado < 0 ? 'text-destructive' : 'text-secondary',
    },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/70 bg-gradient-to-br from-primary/16 via-card to-secondary/14 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Operacao de estoque
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                <Archive className="h-6 w-6 text-primary" />
                Estoque
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Controle entrada de producao, acompanhe o saldo projetado e resolva pedidos antigos que ainda nao consumiram estoque.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                {resumo.produtos} produtos
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {resumo.disponivel} livres agora
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                Projecao {resumo.projetado}
              </Badge>
            </div>
          </div>

          <div className="rounded-[22px] border border-border/70 bg-background/82 p-4 shadow-sm xl:min-w-[560px]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[150px_150px_170px_auto] xl:items-end">
              <div className="space-y-2">
                <Label htmlFor="estoque-data-inicio">De</Label>
                <Input id="estoque-data-inicio" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-11 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estoque-data-fim">Ate</Label>
                <Input id="estoque-data-fim" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-11 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estoque-data-producao">Data produzida</Label>
                <Input
                  id="estoque-data-producao"
                  type="date"
                  value={productionDate}
                  onChange={(event) => setProductionDate(event.target.value)}
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => mutate()} className="h-11 w-full rounded-2xl">
                  <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Tudo que voce registrar abaixo entra como producao do dia {productionDateLabel}.
            </p>
            {isMobile ? (
              <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Role para ver os cards por sabor e use os dois atalhos: ajustar saldo ou registrar producao.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary shadow-sm">
          {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cardsResumo.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className={cn(card.tone, 'gap-0 rounded-[24px] border shadow-sm')}>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  </div>
                  <div className="rounded-2xl border border-background/50 bg-background/55 p-2">
                    <Icon className={cn('h-4 w-4', card.iconClassName)} />
                  </div>
                </div>
                <p className={cn('text-3xl font-semibold tracking-tight', card.valueClassName ?? 'text-foreground')}>
                  {card.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <Card className={data?.pedidosLegadosPendentes ? 'border-warning/35 bg-warning/10' : ''}>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle>Sincronizacao de pedidos antigos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Use essa area apenas quando houver pedidos entregues antigos que ainda nao deram baixa no estoque.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <Badge variant={data?.pedidosLegadosPendentes ? 'secondary' : 'outline'} className="rounded-full px-3 py-1 text-xs">
                {data?.pedidosLegadosPendentes ?? 0} pendencia(s)
              </Badge>
              <Button
                type="button"
                className="w-full rounded-2xl lg:w-auto"
                onClick={syncLegacyStock}
                disabled={syncingLegacy || !data?.pedidosLegadosPendentes}
              >
                {syncingLegacy ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="mr-2 h-4 w-4" />
                )}
                Sincronizar pedidos antigos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-sm">
            <p className="font-medium">Visao rapida</p>
            <p className="mt-1 text-muted-foreground">
              Veja abaixo o motivo por pedido e execute a sincronizacao uma vez para baixar somente os pedidos antigos que ja foram entregues.
            </p>
          </div>

          {Boolean(data?.pedidosLegadosPendentesLista?.length) && (
            <div className="space-y-3">
              {data?.pedidosLegadosPendentesLista.map((pedido) => (
                <div key={pedido.id} className="rounded-2xl border border-warning/25 bg-card/95 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        #{pedido.numero} - {pedido.clienteNome}
                      </p>
                      <p className="text-sm text-muted-foreground">Status atual: {pedido.status}</p>
                      <p className="text-sm text-muted-foreground">Criado em: {formatDateTimeInSaoPaulo(pedido.criadoEm)}</p>
                      <p className="text-sm text-muted-foreground">
                        Baixa registrada: {pedido.estoqueBaixadoEm ? formatDateTimeInSaoPaulo(pedido.estoqueBaixadoEm) : 'Nao'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{pedido.totalItens} unidade(s)</Badge>
                      {pedido.possuiFaltaNoMomento && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Falta estoque agora
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 p-3 text-sm">
                    <p className="font-medium">Motivo rastreado</p>
                    <p className="mt-1 text-muted-foreground">{pedido.motivo}</p>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {pedido.itens.map((item) => (
                      <div key={`${pedido.id}-${item.produtoId}`} className="rounded-xl border bg-background/80 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="font-medium">{item.nomeProduto}</p>
                            <p className="text-sm text-muted-foreground">Precisa baixar {item.quantidade} unidade(s)</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">Disponivel {item.estoqueDisponivelAtual}</Badge>
                            <Badge variant={item.estoqueSuficiente ? 'secondary' : 'destructive'}>
                              {item.estoqueSuficiente ? 'Saldo suficiente' : 'Saldo insuficiente'}
                            </Badge>
                            <Badge variant="outline">Apos baixa {item.saldoAposBaixaItem}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Saldo por produto</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada card resume o saldo atual, reservas, impacto legado e os dois atalhos operacionais do dia.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-xs">
              <CalendarDays className="mr-1 h-3.5 w-3.5" />
              Producao do dia {formatDateInSaoPaulo(productionDate)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : data?.estoque.length ? (
            <div className="grid gap-4 2xl:grid-cols-2">
              {data.estoque.map((item) => (
                <div key={item.produtoId} className="min-w-0 rounded-[26px] border border-border/70 bg-card/98 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold">{item.nomeProduto}</p>
                      <p className="text-sm text-muted-foreground">{item.categoriaNome}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.pendenteBaixaLegada > 0 && (
                        <Badge variant="secondary">Pendente legado {item.pendenteBaixaLegada}</Badge>
                      )}
                      <Badge variant="outline">Reservado {item.quantidadeReservada}</Badge>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Disponivel agora</p>
                      <p className="mt-2 text-3xl font-semibold text-primary">{item.quantidadeDisponivel}</p>
                    </div>
                    <div className="rounded-2xl border border-warning/35 bg-warning/15 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reservado encomendas</p>
                      <p className="mt-2 text-3xl font-semibold">{item.quantidadeReservada}</p>
                    </div>
                    <div className="rounded-2xl border border-muted/80 bg-muted/25 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Baixa legada pendente</p>
                      <p className="mt-2 text-3xl font-semibold">{item.pendenteBaixaLegada}</p>
                    </div>
                    <div className="rounded-2xl border border-accent/45 bg-accent/40 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saldo projetado</p>
                      <p className={`mt-2 text-3xl font-semibold ${item.saldoProjetado < 0 ? 'text-destructive' : 'text-secondary'}`}>
                        {item.saldoProjetado}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="min-w-0 rounded-[22px] border border-border/70 bg-background/80 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Ajuste manual de saldo</p>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Corrige o disponivel atual do sabor sem esperar uma nova producao.
                      </p>
                      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Saldo atual"
                          value={stockDrafts[item.produtoId] ?? ''}
                          onChange={(event) =>
                            setStockDrafts((current) => ({ ...current, [item.produtoId]: event.target.value }))
                          }
                          className="h-11 w-full rounded-2xl"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openStockConfirmation(item.produtoId)}
                          disabled={savingStockId === item.produtoId}
                          className="h-11 w-full rounded-2xl md:justify-center"
                        >
                          {savingStockId === item.produtoId ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {isMobile ? 'Ajustar saldo' : 'Ajustar saldo atual'}
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-0 rounded-[22px] border border-border/70 bg-background/80 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Registrar producao</p>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Some novas unidades ao estoque com a data operacional definida no topo.
                      </p>
                      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Produzidos"
                          value={productionDrafts[item.produtoId] ?? ''}
                          onChange={(event) =>
                            setProductionDrafts((current) => ({ ...current, [item.produtoId]: event.target.value }))
                          }
                          className="h-11 w-full rounded-2xl"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => recordProduction(item.produtoId)}
                          disabled={savingProductionId === item.produtoId}
                          className="h-11 w-full rounded-2xl md:justify-center"
                        >
                          {savingProductionId === item.produtoId ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {isMobile ? 'Registrar' : 'Registrar producao'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cadastre produtos ativos para controlar estoque.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={stockConfirmOpen}
        onOpenChange={(open) => {
          setStockConfirmOpen(open)
          if (!open) {
            setStockConfirmError('')
            setAdminPassword('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ajuste manual de saldo</DialogTitle>
            <DialogDescription>
              Esse ajuste altera o saldo disponivel do produto manualmente. Para evitar erro operacional, confirme com a senha do admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/35 p-3 text-sm">
              <p className="font-medium">{selectedStockItem?.nomeProduto ?? 'Produto'}</p>
              <p className="text-muted-foreground">
                Novo saldo disponivel: {stockConfirmProductId ? stockDrafts[stockConfirmProductId] ?? '0' : '0'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmar-senha-admin">Senha do admin</Label>
              <Input
                id="confirmar-senha-admin"
                type="password"
                placeholder="Digite a senha atual"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
            </div>

            {stockConfirmError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {stockConfirmError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStockConfirmOpen(false)
                setStockConfirmError('')
                setAdminPassword('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveStock}
              disabled={!adminPassword || !stockConfirmProductId || savingStockId === stockConfirmProductId}
            >
              {savingStockId === stockConfirmProductId ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Confirmar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Historico de producao no periodo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use o periodo acima para revisar os registros feitos e conferir o que entrou no estoque em cada dia.
          </p>
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
                <div key={dia.data} className="rounded-[24px] border p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{formatLongDateInSaoPaulo(dia.data)}</p>
                      <p className="text-sm text-muted-foreground">Total produzido: {dia.totalProduzido} unidades</p>
                    </div>
                    <Badge variant="secondary">{dia.itens.length} sabores</Badge>
                  </div>
                  <div className="space-y-2">
                    {dia.itens.map((item) => (
                      <div
                        key={`${dia.data}-${item.produtoId}`}
                        className="flex items-center justify-between rounded-xl border bg-muted/20 p-3 text-sm"
                      >
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
    </div>
  )
}
