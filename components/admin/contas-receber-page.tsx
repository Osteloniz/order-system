'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  BadgeDollarSign,
  CalendarClock,
  CreditCard,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { contaReceberStatusLabels } from '@/lib/finance'
import {
  entregaLabels,
  getPagamentoLabel,
  statusPagamentoColors,
  statusPagamentoLabels,
  statusPedidoReportLabels,
  statusPedidoReportStyles,
} from '@/lib/order-display'
import { formatDateInSaoPaulo, getCurrentMonthRangeInSaoPaulo } from '@/lib/sao-paulo'
import type { StatusPagamento, StatusPedido, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'

type ContaReceberItem = {
  id: string
  numero: string
  clienteNome: string
  clienteTelefone?: string | null
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao | null
  statusPedido: StatusPedido
  statusPagamento: StatusPagamento
  tipoEntrega: TipoEntrega
  dataCompetencia: string
  total: number
  taxa: number
  liquido: number
  statusFinanceiro: 'PREVISTO' | 'REALIZADO' | 'CANCELADO'
}

type ContasReceberData = {
  from: string
  to: string
  status: 'TODOS' | 'PREVISTO' | 'REALIZADO' | 'CANCELADO'
  totalRegistros: number
  resumo: {
    totalBruto: number
    totalTaxas: number
    totalLiquido: number
    previsto: number
    previstoLiquido: number
    realizado: number
    realizadoLiquido: number
    cancelado: number
  }
  contas: ContaReceberItem[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar contas a receber')
  return data
}

function getFinanceiroBadgeClass(status: ContaReceberItem['statusFinanceiro']) {
  if (status === 'REALIZADO') return 'border-success/35 bg-success/12 text-success'
  if (status === 'CANCELADO') return 'border-destructive/35 bg-destructive/10 text-destructive'
  return 'border-primary/35 bg-primary/12 text-primary'
}

function getClienteInitials(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

export function ContasReceberPage() {
  const defaultRange = getCurrentMonthRangeInSaoPaulo()
  const [fromInput, setFromInput] = useState(defaultRange.from)
  const [toInput, setToInput] = useState(defaultRange.to)
  const [statusInput, setStatusInput] = useState<'TODOS' | 'PREVISTO' | 'REALIZADO' | 'CANCELADO'>('TODOS')
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [status, setStatus] = useState<'TODOS' | 'PREVISTO' | 'REALIZADO' | 'CANCELADO'>('TODOS')
  const [search, setSearch] = useState('')

  const periodoPendente = from !== fromInput || to !== toInput || status !== statusInput
  const url = useMemo(() => `/api/admin/financeiro/contas-receber?from=${from}&to=${to}&status=${status}`, [from, to, status])
  const { data, isLoading, mutate } = useSWR<ContasReceberData>(url, fetcher)

  const contasFiltradas = useMemo(() => {
    const busca = search.trim().toLowerCase()
    return (data?.contas ?? []).filter((conta) => {
      if (!busca) return true
      const texto = [
        conta.numero,
        conta.clienteNome,
        conta.clienteTelefone,
        getPagamentoLabel(conta.pagamento, conta.tipoCartao),
        contaReceberStatusLabels[conta.statusFinanceiro],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return texto.includes(busca)
    })
  }, [data?.contas, search])

  const resumoBusca = useMemo(
    () =>
      contasFiltradas.reduce(
        (acc, conta) => {
          acc.total += conta.total
          acc.taxa += conta.taxa
          acc.liquido += conta.liquido
          return acc
        },
        { total: 0, taxa: 0, liquido: 0 }
      ),
    [contasFiltradas]
  )

  const cardsResumo = [
    {
      titulo: 'Previsto',
      valor: formatarMoeda(data?.resumo.previsto ?? 0),
      detalhe: `Liquido: ${formatarMoeda(data?.resumo.previstoLiquido ?? 0)}`,
      icon: CalendarClock,
      tone: 'text-primary',
    },
    {
      titulo: 'Realizado',
      valor: formatarMoeda(data?.resumo.realizado ?? 0),
      detalhe: `Liquido: ${formatarMoeda(data?.resumo.realizadoLiquido ?? 0)}`,
      icon: TrendingUp,
      tone: 'text-success',
    },
    {
      titulo: 'Taxas do periodo',
      valor: formatarMoeda(data?.resumo.totalTaxas ?? 0),
      detalhe: 'Impacto de cartao e taxas operacionais',
      icon: CreditCard,
      tone: 'text-secondary-foreground',
    },
    {
      titulo: 'Titulos no filtro',
      valor: String(data?.totalRegistros ?? 0),
      detalhe: `Cancelado: ${formatarMoeda(data?.resumo.cancelado ?? 0)}`,
      icon: ReceiptText,
      tone: 'text-muted-foreground',
    },
  ]

  const aplicarFiltros = () => {
    setFrom(fromInput)
    setTo(toInput)
    setStatus(statusInput)
  }

  const resetarOuAtualizar = () => {
    if (periodoPendente) {
      setFromInput(defaultRange.from)
      setToInput(defaultRange.to)
      setStatusInput('TODOS')
      setFrom(defaultRange.from)
      setTo(defaultRange.to)
      setStatus('TODOS')
      return
    }

    void mutate()
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BadgeDollarSign className="h-3.5 w-3.5" />
              Receitas e conciliacao
            </div>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <BadgeDollarSign className="h-7 w-7 text-primary" />
              Contas a receber
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Acompanhe o que ainda vai entrar, o que ja entrou e o efeito das taxas sem depender de tabela larga no celular.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Bruto do periodo</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(data?.resumo.totalBruto ?? 0)}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Liquido do periodo</p>
              <p className="mt-1 text-2xl font-bold text-primary">{formatarMoeda(data?.resumo.totalLiquido ?? 0)}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4 sm:col-span-2 xl:col-span-1">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="mt-1 text-2xl font-bold">{data?.totalRegistros ?? 0}</p>
            </div>
          </div>
        </div>
      </section>

      <Card className="border-border/70 bg-card/95">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_160px_220px_minmax(260px,1fr)_auto_auto]">
            <div className="space-y-2">
              <Label>De</Label>
              <Input
                type="date"
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
                className="h-11 rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Ate</Label>
              <Input
                type="date"
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                className="h-11 rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Status financeiro</Label>
              <Select value={statusInput} onValueChange={(value) => setStatusInput(value as typeof statusInput)}>
                <SelectTrigger className="h-11 rounded-2xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="PREVISTO">Previsto</SelectItem>
                  <SelectItem value="REALIZADO">Realizado</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pedido, cliente ou pagamento"
                  className="h-11 rounded-2xl pl-9"
                />
              </div>
            </div>
            <Button className="h-11 rounded-2xl xl:self-end" onClick={aplicarFiltros} disabled={!periodoPendente}>
              <Search className="mr-2 h-4 w-4" />
              Buscar
            </Button>
            <Button className="h-11 rounded-2xl xl:self-end" variant="outline" onClick={resetarOuAtualizar}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {periodoPendente ? 'Limpar' : 'Atualizar'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
            <span>{contasFiltradas.length} titulo(s) visivel(is)</span>
            <span className="hidden sm:inline">-</span>
            <span>Os totais abaixo respeitam a busca atual</span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cardsResumo.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.titulo} className="border-border/70 bg-card/95">
                <CardContent className="p-5">
                  <Icon className={`mb-3 h-5 w-5 ${card.tone}`} />
                  <p className="text-sm text-muted-foreground">{card.titulo}</p>
                  <p className="mt-1 text-3xl font-bold">{card.valor}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.detalhe}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Lista de recebimentos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Visualize os titulos filtrados com leitura clara no mobile e tabela completa no desktop.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Bruto filtrado
              </div>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.total)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                Taxa filtrada
              </div>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.taxa)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Liquido filtrado
              </div>
              <p className="mt-1 text-2xl font-bold text-primary">{formatarMoeda(resumoBusca.liquido)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : contasFiltradas.length ? (
            <>
              <div className="grid gap-3 lg:hidden">
                {contasFiltradas.map((conta) => (
                  <div key={conta.id} className="rounded-[22px] border border-border/70 bg-background/80 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/85 text-sm font-semibold text-muted-foreground">
                        {getClienteInitials(conta.clienteNome)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold">#{conta.numero}</p>
                            <p className="break-words text-sm text-foreground">{conta.clienteNome}</p>
                            <p className="text-xs text-muted-foreground">{formatarTelefone(conta.clienteTelefone)}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDateInSaoPaulo(conta.dataCompetencia)}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={getFinanceiroBadgeClass(conta.statusFinanceiro)}>
                            {contaReceberStatusLabels[conta.statusFinanceiro]}
                          </Badge>
                          <Badge variant="outline" className={statusPedidoReportStyles[conta.statusPedido]}>
                            {statusPedidoReportLabels[conta.statusPedido]}
                          </Badge>
                          <Badge variant="outline" className={statusPagamentoColors[conta.statusPagamento]}>
                            {statusPagamentoLabels[conta.statusPagamento]}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-border/70 bg-card px-3 py-3">
                            <p className="text-xs text-muted-foreground">Pagamento</p>
                            <p className="mt-1 text-sm font-medium">{getPagamentoLabel(conta.pagamento, conta.tipoCartao)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{entregaLabels[conta.tipoEntrega]}</p>
                          </div>
                          <div className="rounded-2xl border border-border/70 bg-card px-3 py-3">
                            <p className="text-xs text-muted-foreground">Valores</p>
                            <div className="mt-1 space-y-1 text-sm">
                              <p className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Bruto</span>
                                <span className="font-medium">{formatarMoeda(conta.total)}</span>
                              </p>
                              <p className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Taxa</span>
                                <span>{formatarMoeda(conta.taxa)}</span>
                              </p>
                              <p className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Liquido</span>
                                <span className="font-semibold text-primary">{formatarMoeda(conta.liquido)}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border lg:block">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/35 text-left text-muted-foreground">
                    <tr>
                      <th className="py-3 pl-4 pr-4 font-medium">Pedido</th>
                      <th className="py-3 pr-4 font-medium">Cliente</th>
                      <th className="py-3 pr-4 font-medium">Data</th>
                      <th className="py-3 pr-4 font-medium">Pagamento</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Bruto</th>
                      <th className="py-3 pr-4 font-medium">Taxa</th>
                      <th className="py-3 pr-4 font-medium">Liquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasFiltradas.map((conta) => (
                      <tr key={conta.id} className="border-t odd:bg-background even:bg-muted/15">
                        <td className="py-3 pl-4 pr-4 font-semibold">#{conta.numero}</td>
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-medium">{conta.clienteNome}</p>
                            <p className="text-xs text-muted-foreground">{formatarTelefone(conta.clienteTelefone)}</p>
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">{formatDateInSaoPaulo(conta.dataCompetencia)}</td>
                        <td className="py-3 pr-4">
                          <div>
                            <p>{getPagamentoLabel(conta.pagamento, conta.tipoCartao)}</p>
                            <p className="text-xs text-muted-foreground">{entregaLabels[conta.tipoEntrega]}</p>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className={getFinanceiroBadgeClass(conta.statusFinanceiro)}>
                              {contaReceberStatusLabels[conta.statusFinanceiro]}
                            </Badge>
                            <Badge variant="outline" className={statusPedidoReportStyles[conta.statusPedido]}>
                              {statusPedidoReportLabels[conta.statusPedido]}
                            </Badge>
                            <Badge variant="outline" className={statusPagamentoColors[conta.statusPagamento]}>
                              {statusPagamentoLabels[conta.statusPagamento]}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-semibold">{formatarMoeda(conta.total)}</td>
                        <td className="py-3 pr-4">{formatarMoeda(conta.taxa)}</td>
                        <td className="py-3 pr-4 font-semibold text-primary">{formatarMoeda(conta.liquido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum recebimento encontrado para os filtros aplicados.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
