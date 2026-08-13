'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  AlertTriangle,
  Archive,
  Boxes,
  CalendarDays,
  ChevronDown,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  disponivelParaEncomenda: boolean
  statusDisponibilidade: 'DISPONIVEL' | 'SOMENTE_ENCOMENDA' | 'INDISPONIVEL'
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
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [savingStockId, setSavingStockId] = useState<string | null>(null)
  const [syncingLegacy, setSyncingLegacy] = useState(false)
  const [stockConfirmOpen, setStockConfirmOpen] = useState(false)
  const [stockConfirmProductId, setStockConfirmProductId] = useState<string | null>(null)
  const [productionDialogOpen, setProductionDialogOpen] = useState(false)
  const [productionTotal, setProductionTotal] = useState('')
  const [productionBatchSelected, setProductionBatchSelected] = useState<Record<string, boolean>>({})
  const [productionBatchDrafts, setProductionBatchDrafts] = useState<Record<string, string>>({})
  const [productionDialogError, setProductionDialogError] = useState('')
  const [savingProductionBatch, setSavingProductionBatch] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [stockConfirmError, setStockConfirmError] = useState('')
  const [message, setMessage] = useState('')

  const url = useMemo(() => `/api/admin/producao?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<EstoqueData>(url, fetcher, {
    refreshInterval: 15000,
  })

  useEffect(() => {
    if (!data?.estoque) return
    setStockDrafts((current) => (
      Object.fromEntries(
        data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? String(item.quantidadeDisponivel)]),
      )
    ))
    setProductionBatchSelected((current) => (
      Object.fromEntries(
        data.estoque.map((item) => [item.produtoId, current[item.produtoId] ?? false]),
      )
    ))
  }, [data?.estoque])

  const resetProductionBatchDrafts = () => {
    setProductionTotal('')
    setProductionDialogError('')
    setProductionBatchSelected(
      Object.fromEntries((data?.estoque ?? []).map((item) => [item.produtoId, false])),
    )
    setProductionBatchDrafts(
      Object.fromEntries((data?.estoque ?? []).map((item) => [item.produtoId, ''])),
    )
  }

  const openProductionDialog = () => {
    resetProductionBatchDrafts()
    setProductionDialogOpen(true)
  }

  const saveProductionBatch = async () => {
    const totalProduzido = Number(productionTotal)
    const itens = (data?.estoque ?? [])
      .map((item) => ({
        produtoId: item.produtoId,
        nomeProduto: item.nomeProduto,
        quantidade: Number(productionBatchDrafts[item.produtoId] ?? 0),
      }))
      .filter((item) => Number.isFinite(item.quantidade) && item.quantidade > 0)

    const somaSabores = itens.reduce((acc, item) => acc + item.quantidade, 0)

    if (!Number.isFinite(totalProduzido) || totalProduzido <= 0) {
      setProductionDialogError('Informe o total produzido do dia.')
      return
    }

    if (itens.length === 0) {
      setProductionDialogError('Informe pelo menos um sabor produzido.')
      return
    }

    if (somaSabores !== totalProduzido) {
      setProductionDialogError('A soma dos sabores precisa bater exatamente com o total produzido.')
      return
    }

    setSavingProductionBatch(true)
    setMessage('')
    setProductionDialogError('')
    try {
      const response = await fetch('/api/admin/producao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD_PRODUCTION_BATCH',
          dataProducao: productionDate,
          totalProduzido: Math.floor(totalProduzido),
          itens: itens.map((item) => ({
            produtoId: item.produtoId,
            quantidade: Math.floor(item.quantidade),
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao registrar producao')
      setProductionDialogOpen(false)
      resetProductionBatchDrafts()
      setMessage(`Producao registrada com sucesso. Total do lote: ${result.totalProduzido} unidade(s).`)
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao registrar producao'
      setProductionDialogError(errorMessage)
      setMessage(errorMessage)
    } finally {
      setSavingProductionBatch(false)
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
  const productionBatchRows = useMemo(
    () => (data?.estoque ?? []).map((item) => ({
      ...item,
      selecionado: productionBatchSelected[item.produtoId] ?? false,
      quantidadeDigitada: Number(productionBatchDrafts[item.produtoId] ?? 0) || 0,
    })),
    [data?.estoque, productionBatchDrafts, productionBatchSelected],
  )
  const productionBatchSum = productionBatchRows.reduce((acc, item) => acc + item.quantidadeDigitada, 0)

  const resumo = useMemo(() => {
    const estoque = data?.estoque ?? []
    return {
      produtos: estoque.length,
      disponivel: estoque.reduce((acc, item) => acc + item.quantidadeDisponivel, 0),
      reservado: estoque.reduce((acc, item) => acc + item.quantidadeReservada, 0),
      projetado: estoque.reduce((acc, item) => acc + item.saldoProjetado, 0),
      legado: estoque.reduce((acc, item) => acc + item.pendenteBaixaLegada, 0),
      vendaImediata: estoque.filter((item) => item.statusDisponibilidade === 'DISPONIVEL').length,
      somenteEncomenda: estoque.filter((item) => item.statusDisponibilidade === 'SOMENTE_ENCOMENDA').length,
      indisponiveis: estoque.filter((item) => item.statusDisponibilidade === 'INDISPONIVEL').length,
    }
  }, [data?.estoque])

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Archive className="h-5 w-5 text-primary" /><h1 className="text-xl font-bold">Estoque e produção</h1></div>
          <p className="mt-0.5 text-xs text-muted-foreground">Saldo atual, reservas e lotes produzidos.</p>
        </div>
        <Button type="button" size="sm" className="h-9 shrink-0 rounded-lg" onClick={openProductionDialog}>
          <Plus className="h-4 w-4" /> Produção
        </Button>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.produtos}</strong> produtos</span>
        <span className="shrink-0 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5 text-primary"><strong>{resumo.disponivel}</strong> livres</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.reservado}</strong> reservados</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.somenteEncomenda}</strong> encomenda</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5">projeção <strong>{resumo.projetado}</strong></span>
      </div>

      <section className="rounded-xl border border-border/70 bg-card p-2.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[145px_145px_160px_minmax(0,1fr)_40px] sm:items-end">
          <div className="space-y-1"><Label htmlFor="estoque-data-inicio" className="text-[11px]">De</Label><Input id="estoque-data-inicio" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg" /></div>
          <div className="space-y-1"><Label htmlFor="estoque-data-fim" className="text-[11px]">Até</Label><Input id="estoque-data-fim" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg" /></div>
          <div className="col-span-2 space-y-1 sm:col-span-1"><Label htmlFor="estoque-data-producao" className="text-[11px]">Data da produção</Label><Input id="estoque-data-producao" type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} className="h-9 rounded-lg" /></div>
          <p className="hidden text-xs text-muted-foreground sm:block">Novos lotes entram em {productionDateLabel}.</p>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => mutate()} aria-label="Atualizar estoque"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </section>

      {message && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary shadow-sm">
          {message}
        </div>
      )}

      <details className={cn('group overflow-hidden rounded-xl border bg-card', data?.pedidosLegadosPendentes ? 'border-warning/35' : 'border-border/70')}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-warning" /><span className="flex-1">Sincronização de pedidos antigos</span><Badge variant="outline">{data?.pedidosLegadosPendentes ?? 0}</Badge><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
      <Card className="gap-0 rounded-none border-0 border-t border-border/60 py-0 shadow-none">
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
      </details>

      <Card className="gap-0 overflow-hidden rounded-xl border-border/70 py-0">
        <CardHeader className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base">Saldo por sabor</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Toque nos valores somente quando precisar corrigir o saldo.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-xs">
              <CalendarDays className="mr-1 h-3.5 w-3.5" />
              Producao do dia {formatDateInSaoPaulo(productionDate)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : data?.estoque.length ? (
            <div>
              {data.estoque.map((item) => (
                <div key={item.produtoId} className="min-w-0 border-t border-border/60 p-2.5 first:border-t-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.nomeProduto}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.categoriaNome}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          item.statusDisponibilidade === 'DISPONIVEL' && 'border-primary/25 text-primary',
                          item.statusDisponibilidade === 'SOMENTE_ENCOMENDA' && 'border-warning/35 text-warning-foreground',
                          item.statusDisponibilidade === 'INDISPONIVEL' && 'border-destructive/30 text-destructive',
                        )}
                      >
                        {item.statusDisponibilidade === 'DISPONIVEL'
                          ? 'Venda imediata'
                          : item.statusDisponibilidade === 'SOMENTE_ENCOMENDA'
                            ? 'Somente encomenda'
                            : 'Indisponivel'}
                      </Badge>
                      {item.disponivelParaEncomenda ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Encomenda</Badge> : null}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-1 py-1.5"><p className="text-[9px] text-muted-foreground">Livre</p><p className="text-base font-bold text-primary">{item.quantidadeDisponivel}</p></div>
                    <div className="rounded-lg border px-1 py-1.5"><p className="text-[9px] text-muted-foreground">Reservado</p><p className="text-base font-bold">{item.quantidadeReservada}</p></div>
                    <div className="rounded-lg border px-1 py-1.5"><p className="text-[9px] text-muted-foreground">Legado</p><p className="text-base font-bold">{item.pendenteBaixaLegada}</p></div>
                    <div className="rounded-lg border px-1 py-1.5"><p className="text-[9px] text-muted-foreground">Projetado</p><p className={cn('text-base font-bold', item.saldoProjetado < 0 ? 'text-destructive' : 'text-secondary')}>{item.saldoProjetado}</p></div>
                  </div>

                  <details className="group mt-2 rounded-lg border border-border/70 bg-background/70">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs font-medium"><Boxes className="h-3.5 w-3.5 text-primary" /><span className="flex-1">Ajustar saldo manualmente</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
                    <div className="grid gap-2 border-t border-border/60 p-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Saldo atual"
                        value={stockDrafts[item.produtoId] ?? ''}
                        onChange={(event) =>
                          setStockDrafts((current) => ({ ...current, [item.produtoId]: event.target.value }))
                        }
                        className="h-9 w-full rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openStockConfirmation(item.produtoId)}
                        disabled={savingStockId === item.produtoId}
                        className="h-9 w-full rounded-lg md:justify-center"
                      >
                        {savingStockId === item.produtoId ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {isMobile ? 'Ajustar saldo' : 'Ajustar saldo atual'}
                      </Button>
                    </div>
                  </details>
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
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-md rounded-2xl p-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">Confirmar ajuste de saldo</DialogTitle>
            <DialogDescription className="text-xs">
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
                className="h-9 rounded-lg"
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

      <Dialog
        open={productionDialogOpen}
        onOpenChange={(open) => {
          setProductionDialogOpen(open)
          if (!open) {
            setProductionDialogError('')
          }
        }}
      >
        <DialogContent className="flex h-[min(92dvh,780px)] w-[calc(100vw-0.75rem)] max-w-3xl flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base">Registrar produção</DialogTitle>
            <DialogDescription className="text-xs">
              Informe o total de cookies produzidos e distribua obrigatoriamente esse total entre os sabores.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="producao-total" className="text-xs">Total produzido</Label>
                <Input
                  id="producao-total"
                  type="number"
                  min={1}
                  placeholder="Ex: 24"
                  value={productionTotal}
                  onChange={(event) => setProductionTotal(event.target.value)}
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="rounded-lg border border-border/70 bg-background/80 p-2.5 text-xs">
                <p className="font-medium">Resumo da conferência</p>
                <p className="mt-1 text-muted-foreground">Data operacional: {productionDateLabel}</p>
                <p className="mt-2 text-muted-foreground">Soma dos sabores lançados: {productionBatchSum}</p>
                <p className={cn('mt-1 font-medium', Number(productionTotal || 0) === productionBatchSum ? 'text-primary' : 'text-warning-foreground')}>
                  {Number(productionTotal || 0) === productionBatchSum
                    ? 'Total conferido com sucesso.'
                    : 'A soma dos sabores precisa bater exatamente com o total.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Sabores produzidos</p>
                  <p className="text-[11px] text-muted-foreground">Marque e informe a quantidade.</p>
                </div>
                <Badge variant="outline">{productionBatchRows.length} sabores no controle</Badge>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70">
                {productionBatchRows.map((item) => (
                  <div
                    key={item.produtoId}
                    className={cn(
                      'border-b border-border/60 bg-background/80 p-2.5 transition-colors last:border-b-0',
                      item.selecionado && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <label
                        htmlFor={`producao-check-${item.produtoId}`}
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5"
                      >
                        <Checkbox
                          id={`producao-check-${item.produtoId}`}
                          checked={item.selecionado}
                          onCheckedChange={(checked) => {
                            const ativo = checked === true
                            setProductionBatchSelected((current) => ({
                              ...current,
                              [item.produtoId]: ativo,
                            }))
                            if (!ativo) {
                              setProductionBatchDrafts((current) => ({
                                ...current,
                                [item.produtoId]: '',
                              }))
                            }
                          }}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.nomeProduto}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{item.categoriaNome} · livre {item.quantidadeDisponivel}</p>
                        </div>
                      </label>
                      <Input
                        id={`producao-item-${item.produtoId}`}
                        type="number"
                        min={0}
                        disabled={!item.selecionado}
                        placeholder="0"
                        value={productionBatchDrafts[item.produtoId] ?? ''}
                        onChange={(event) =>
                          setProductionBatchDrafts((current) => ({
                            ...current,
                            [item.produtoId]: event.target.value,
                          }))
                        }
                        className="h-8 w-20 shrink-0 rounded-lg text-center"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {productionDialogError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {productionDialogError}
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/70 bg-background/95 p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setProductionDialogOpen(false)
                setProductionDialogError('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveProductionBatch}
              disabled={savingProductionBatch}
            >
              {savingProductionBatch ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar producao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="gap-0 rounded-xl border-border/70 py-0">
        <CardHeader className="p-3">
          <CardTitle className="text-base">Histórico de produção</CardTitle>
          <p className="text-xs text-muted-foreground">Registros do período selecionado.</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : data?.historicoProducao.length ? (
            <div className="space-y-2">
              {data.historicoProducao.map((dia) => (
                <details key={dia.data} className="group rounded-lg border border-border/70">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold">{formatLongDateInSaoPaulo(dia.data)}</p>
                      <p className="text-xs text-muted-foreground">{dia.totalProduzido} unidades · {dia.itens.length} sabores</p>
                    </div>
                    <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-1.5 border-t border-border/60 p-2">
                    {dia.itens.map((item) => (
                      <div
                        key={`${dia.data}-${item.produtoId}`}
                        className="flex items-center justify-between rounded-lg bg-muted/20 px-2.5 py-2 text-sm"
                      >
                        <span>{item.nomeProduto}</span>
                        <span className="font-semibold">{item.quantidade}</span>
                      </div>
                    ))}
                  </div>
                </details>
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
