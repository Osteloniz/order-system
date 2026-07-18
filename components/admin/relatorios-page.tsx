'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BarChart3, CheckCircle2, Download, PackageCheck, ReceiptText, RefreshCw, Search, Sparkles, TrendingUp, XCircle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { entregaLabels, getPagamentoLabel, statusPagamentoLabels, statusPedidoReportLabels, statusPedidoReportStyles } from '@/lib/order-display'
import { isPedidoRealizadoFinanceiramente } from '@/lib/order-finance'
import { formatDateTimeInSaoPaulo, getCurrentWeekRangeInSaoPaulo } from '@/lib/sao-paulo'
import type { StatusPagamento, StatusPedido, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'

type RelatorioProduto = {
  chave: string
  produtoId: string
  nomeProduto: string
  precoUnitario: number
  quantidade: number
  total: number
  pedidos: number
}

type RelatorioPedido = {
  id: string
  numero: string
  status: StatusPedido
  statusPagamento: StatusPagamento
  clienteNome: string
  clienteTelefone?: string | null
  clienteWhatsapp?: string | null
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao | null
  responsavelPedido?: string | null
  destinatariosPedido?: string | null
  observacoesPedido?: string | null
  levadoEm?: string | null
  tipoEntrega: TipoEntrega
  encomendaPara?: string | null
  criadoEm: string
  total: number
  itens: {
    id: string
    nomeProduto: string
    precoUnitario: number
    quantidade: number
    totalItem: number
  }[]
}

type RelatorioFornecedor = {
  nome: string
  quantidade: number
  total: number
  pago: number
  pendente: number
}

type RelatorioData = {
  from: string
  to: string
  totalPedidos: number
  receitaTotal: number
  receitaEntregue: number
  totalCancelado: number
  pagamentosPendentes: number
  receitaCartaoBruta: number
  taxaCartao: number
  receitaCartaoLiquida: number
  mimosConcedidos: number
  valorMimosConcedidos: number
  recebimentoPrevisto: number
  recebimentoRealizado: number
  recebimentoEmAberto: number
  valorCancelado: number
  taxaCartaoPrevista: number
  taxaCartaoRealizada: number
  cartaoCreditoBruto: number
  cartaoDebitoBruto: number
  custosTotal: number
  custosPendentes: number
  custosPagos: number
  custosCancelados: number
  resultadoRealizado: number
  fornecedores: RelatorioFornecedor[]
  ticketMedioGeral: number
  ticketMedioEntregue: number
  porStatus: Record<StatusPedido, number>
  produtos: RelatorioProduto[]
  pedidos: RelatorioPedido[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar relatorio')
  return data
}

function moneyForCsv(value: number) {
  return (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function csvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""')
  return `"${text}"`
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = ['sep=;', ...rows.map((row) => row.map(csvCell).join(';'))].join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function RelatoriosPage() {
  const defaultWeek = getCurrentWeekRangeInSaoPaulo()
  const [fromInput, setFromInput] = useState(defaultWeek.from)
  const [toInput, setToInput] = useState(defaultWeek.to)
  const [from, setFrom] = useState(defaultWeek.from)
  const [to, setTo] = useState(defaultWeek.to)
  const [listFrom, setListFrom] = useState(defaultWeek.from)
  const [listTo, setListTo] = useState(defaultWeek.to)
  const [listFromInput, setListFromInput] = useState(defaultWeek.from)
  const [listToInput, setListToInput] = useState(defaultWeek.to)
  const [searchPedido, setSearchPedido] = useState('')
  const [searchPedidoInput, setSearchPedidoInput] = useState('')
  const [statusPagamentoFiltro, setStatusPagamentoFiltro] = useState<'TODOS' | StatusPagamento>('TODOS')
  const [statusPedidoFiltro, setStatusPedidoFiltro] = useState<'TODOS' | StatusPedido>('TODOS')
  const [statusPagamentoFiltroInput, setStatusPagamentoFiltroInput] = useState<'TODOS' | StatusPagamento>('TODOS')
  const [statusPedidoFiltroInput, setStatusPedidoFiltroInput] = useState<'TODOS' | StatusPedido>('TODOS')
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)
  const url = useMemo(() => `/api/admin/relatorios?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<RelatorioData>(url, fetcher)
  const periodoPendente = fromInput !== from || toInput !== to
  const filtrosPedidosPendentes =
    listFromInput !== listFrom ||
    listToInput !== listTo ||
    searchPedidoInput !== searchPedido ||
    statusPagamentoFiltroInput !== statusPagamentoFiltro ||
    statusPedidoFiltroInput !== statusPedidoFiltro

  const totalUnidades = useMemo(() => data?.produtos.reduce((acc, produto) => acc + produto.quantidade, 0) ?? 0, [data])
  const topProduto = data?.produtos[0]
  const entregues = data?.porStatus.ENTREGUE ?? 0
  const pedidosPendentes = useMemo(
    () => data?.pedidos.filter((pedido) => pedido.statusPagamento === 'PENDENTE') ?? [],
    [data]
  )
  const pedidosFiltrados = useMemo(() => {
    const pedidos = data?.pedidos ?? []
    return pedidos.filter((pedido) => {
      const dataReferencia = pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? pedido.encomendaPara : pedido.criadoEm
      const diaPedido = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(dataReferencia))
      const busca = searchPedido.trim().toLowerCase()
      const textoBusca = [
        pedido.numero,
        pedido.clienteNome,
        pedido.clienteTelefone,
        pedido.clienteWhatsapp,
        pedido.responsavelPedido,
        pedido.destinatariosPedido,
        pedido.observacoesPedido,
        ...pedido.itens.map((item) => item.nomeProduto),
      ].filter(Boolean).join(' ').toLowerCase()

      if (busca && !textoBusca.includes(busca)) return false
      if (listFrom && diaPedido < listFrom) return false
      if (listTo && diaPedido > listTo) return false
      if (statusPagamentoFiltro !== 'TODOS' && pedido.statusPagamento !== statusPagamentoFiltro) return false
      if (statusPedidoFiltro !== 'TODOS' && pedido.status !== statusPedidoFiltro) return false
      return true
    })
  }, [data?.pedidos, listFrom, listTo, searchPedido, statusPagamentoFiltro, statusPedidoFiltro])

  const resumoFiltrado = useMemo(() => {
    return pedidosFiltrados.reduce((acc, pedido) => {
      acc.total += pedido.total
      if (pedido.status === 'CANCELADO') {
        acc.cancelado += pedido.total
        return acc
      }
      if (isPedidoRealizadoFinanceiramente(pedido)) {
        acc.realizado += pedido.total
      } else {
        acc.previsto += pedido.total
      }
      return acc
    }, { total: 0, realizado: 0, previsto: 0, cancelado: 0 })
  }, [pedidosFiltrados])

  const graficoGestao = useMemo(() => [
    { chave: 'realizado', label: 'Realizado', valor: data?.recebimentoRealizado ?? 0, fill: 'var(--chart-2)' },
    { chave: 'previsto', label: 'Previsto', valor: data?.recebimentoPrevisto ?? 0, fill: 'var(--chart-1)' },
    { chave: 'aberto', label: 'Em aberto', valor: data?.recebimentoEmAberto ?? 0, fill: 'var(--chart-3)' },
    { chave: 'cancelado', label: 'Cancelado', valor: data?.valorCancelado ?? 0, fill: 'var(--destructive)' },
  ], [data?.recebimentoEmAberto, data?.recebimentoPrevisto, data?.recebimentoRealizado, data?.valorCancelado])

  const handleExportProdutos = () => {
    if (!data?.produtos.length) return

    downloadCsv(`relatorio-sabores-${from}-a-${to}.csv`, [
      ['Periodo', `${from} ate ${to}`],
      ['Ticket medio entregue', moneyForCsv(data.ticketMedioEntregue)],
      ['Receita entregue', moneyForCsv(data.receitaEntregue)],
      ['Mimos concedidos', data.mimosConcedidos],
      ['Valor referencial dos mimos', moneyForCsv(data.valorMimosConcedidos)],
      [],
      ['Sabor', 'Quantidade', 'Valor unitario', 'Total', 'Pedidos'],
      ...data.produtos.map((produto) => [
        produto.nomeProduto,
        produto.quantidade,
        moneyForCsv(produto.precoUnitario),
        moneyForCsv(produto.total),
        produto.pedidos,
      ]),
    ])
  }

  const handleAplicarPeriodo = () => {
    setFrom(fromInput)
    setTo(toInput)
  }

  const handleLimparPeriodo = () => {
    const week = getCurrentWeekRangeInSaoPaulo()
    setFromInput(week.from)
    setToInput(week.to)
    setFrom(week.from)
    setTo(week.to)
    setListFrom(week.from)
    setListTo(week.to)
    setListFromInput(week.from)
    setListToInput(week.to)
    setSearchPedido('')
    setSearchPedidoInput('')
    setStatusPagamentoFiltro('TODOS')
    setStatusPedidoFiltro('TODOS')
    setStatusPagamentoFiltroInput('TODOS')
    setStatusPedidoFiltroInput('TODOS')
  }

  const handleAplicarFiltrosPedidos = () => {
    setListFrom(listFromInput)
    setListTo(listToInput)
    setSearchPedido(searchPedidoInput)
    setStatusPagamentoFiltro(statusPagamentoFiltroInput)
    setStatusPedidoFiltro(statusPedidoFiltroInput)
  }

  const handleLimparFiltrosPedidos = () => {
    const week = getCurrentWeekRangeInSaoPaulo()
    setListFromInput(week.from)
    setListToInput(week.to)
    setListFrom(week.from)
    setListTo(week.to)
    setSearchPedidoInput('')
    setSearchPedido('')
    setStatusPagamentoFiltroInput('TODOS')
    setStatusPagamentoFiltro('TODOS')
    setStatusPedidoFiltroInput('TODOS')
    setStatusPedidoFiltro('TODOS')
  }

  const cardsVisaoGeral = [
    {
      key: 'pedidos',
      className: 'border-primary/35 bg-primary/10',
      icon: ReceiptText,
      iconClass: 'text-primary',
      title: 'Pedidos no periodo',
      value: String(data?.totalPedidos ?? 0),
      detail: `${entregues} entregues`,
    },
    {
      key: 'receita',
      className: 'border-secondary/35 bg-secondary/10',
      icon: PackageCheck,
      iconClass: 'text-secondary',
      title: 'Receita entregue',
      value: formatarMoeda(data?.receitaEntregue ?? 0),
      detail: 'Base para resultado real',
    },
    {
      key: 'ticket',
      className: 'border-warning/45 bg-warning/15',
      icon: TrendingUp,
      iconClass: 'text-warning-foreground',
      title: 'Ticket medio',
      value: formatarMoeda(data?.ticketMedioEntregue ?? 0),
      detail: 'Sobre pedidos entregues',
    },
    {
      key: 'unidades',
      className: 'border-accent/45 bg-accent/60',
      icon: BarChart3,
      iconClass: 'text-accent-foreground',
      title: 'Unidades vendidas',
      value: String(totalUnidades),
      detail: 'Somando todos os sabores',
    },
    {
      key: 'mimos',
      className: 'border-secondary/30 bg-secondary/12',
      icon: Sparkles,
      iconClass: 'text-secondary',
      title: 'Mimos concedidos',
      value: String(data?.mimosConcedidos ?? 0),
      detail: `Valor referencial: ${formatarMoeda(data?.valorMimosConcedidos ?? 0)}`,
    },
    {
      key: 'cartao',
      className: 'border-primary/25 bg-primary/5',
      icon: PackageCheck,
      iconClass: 'text-primary',
      title: 'Cartao bruto / liquido',
      value: formatarMoeda(data?.receitaCartaoBruta ?? 0),
      detail: `Liquido: ${formatarMoeda(data?.receitaCartaoLiquida ?? 0)} • Taxas: ${formatarMoeda(data?.taxaCartao ?? 0)}`,
    },
    {
      key: 'pendencias',
      className: 'border-warning/35 bg-warning/10',
      icon: ReceiptText,
      iconClass: 'text-warning-foreground',
      title: 'Pendencias / cancelado',
      value: String(data?.pagamentosPendentes ?? 0),
      detail: `Cancelado: ${formatarMoeda(data?.totalCancelado ?? 0)}`,
    },
    {
      key: 'custos',
      className: 'border-muted-foreground/20 bg-muted/20',
      icon: XCircle,
      iconClass: 'text-muted-foreground',
      title: 'Custos do periodo',
      value: formatarMoeda(data?.custosTotal ?? 0),
      detail: `Pago: ${formatarMoeda(data?.custosPagos ?? 0)} • Pendente: ${formatarMoeda(data?.custosPendentes ?? 0)}`,
    },
    {
      key: 'resultado',
      className: 'border-success/25 bg-success/10',
      icon: TrendingUp,
      iconClass: 'text-success',
      title: 'Resultado realizado',
      value: formatarMoeda(data?.resultadoRealizado ?? 0),
      detail: 'Recebido menos custos pagos no periodo',
    },
  ]

  const confirmarPagamento = async (pedidoId: string) => {
    setUpdatingPaymentId(pedidoId)
    try {
      const response = await fetch(`/api/admin/pedidos/${pedidoId}/pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusPagamento: 'APROVADO' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao confirmar pagamento')
      await mutate()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Erro ao confirmar pagamento')
    } finally {
      setUpdatingPaymentId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/18 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="mb-3 bg-secondary text-secondary-foreground hover:bg-secondary">
              <Sparkles className="mr-1 h-3 w-3" /> Inteligencia do dia
            </Badge>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <BarChart3 className="h-7 w-7 text-primary" />
              Relatorios
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Acompanhe faturamento, ticket medio, sabores mais vendidos e exporte os dados para planilha.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Periodo padrao da tela: semana atual, de domingo a sabado.
            </p>
          </div>
          <div className="w-full max-w-3xl space-y-3 lg:max-w-none lg:flex-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>De</Label>
                <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ate</Label>
                <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Button type="button" className="w-full whitespace-nowrap" onClick={handleAplicarPeriodo} disabled={!periodoPendente}>
                <Search className="mr-2 h-4 w-4" /> Buscar periodo
              </Button>
              <Button type="button" variant="outline" className="w-full whitespace-nowrap" onClick={periodoPendente ? handleLimparPeriodo : () => mutate()}>
                <RefreshCw className="mr-2 h-4 w-4" /> {periodoPendente ? 'Limpar periodo' : 'Atualizar'}
              </Button>
              <Button type="button" variant="outline" className="w-full whitespace-nowrap" onClick={handleExportProdutos} disabled={!data?.produtos.length}>
                <Download className="mr-2 h-4 w-4" /> Exportar Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cardsVisaoGeral.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.key} className={card.className}>
                <CardContent className="p-5">
                  <Icon className={`mb-3 h-5 w-5 ${card.iconClass}`} />
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold">{card.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/25"><CardTitle>Status do periodo</CardTitle></CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-1">
            {(Object.keys(statusPedidoReportLabels) as StatusPedido[]).map((status) => (
              <div key={status} className={`rounded-xl border p-4 ${statusPedidoReportStyles[status]}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{statusPedidoReportLabels[status]}</p>
                  <p className="text-2xl font-bold">{data?.porStatus?.[status] ?? 0}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

      <Card className="overflow-hidden border-warning/40 bg-gradient-to-br from-warning/18 to-primary/8">
          <CardHeader><CardTitle>Leitura rapida</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">Sabor lider</p>
              <p className="mt-1 text-xl font-bold">{topProduto?.nomeProduto ?? 'Sem vendas no periodo'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{topProduto ? `${topProduto.quantidade} unidade(s), ${formatarMoeda(topProduto.total)}` : 'Selecione outro periodo para analisar.'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Ticket geral</p><p className="text-xl font-bold">{formatarMoeda(data?.ticketMedioGeral ?? 0)}</p></div>
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Receita geral</p><p className="text-xl font-bold">{formatarMoeda(data?.receitaTotal ?? 0)}</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Previsto para receber</p><p className="text-xl font-bold">{formatarMoeda(data?.recebimentoPrevisto ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Ainda nao realizado</p></div>
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Realizado</p><p className="text-xl font-bold">{formatarMoeda(data?.recebimentoRealizado ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Pagamento aprovado ou dinheiro entregue</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Mimos no periodo</p><p className="text-xl font-bold">{data?.mimosConcedidos ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Baixados no estoque sem entrar no contas a receber</p></div>
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Valor referencial dos mimos</p><p className="text-xl font-bold">{formatarMoeda(data?.valorMimosConcedidos ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Ajuda a medir o beneficio concedido</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Custos pagos</p><p className="text-xl font-bold">{formatarMoeda(data?.custosPagos ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Contas ja baixadas no periodo</p></div>
              <div className="rounded-2xl bg-background/75 p-4"><p className="text-sm text-muted-foreground">Resultado realizado</p><p className="text-xl font-bold">{formatarMoeda(data?.resultadoRealizado ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Recebido menos custos pagos</p></div>
            </div>
            <p className="text-xs text-muted-foreground">Dica: os valores de cartao ja diferenciam credito e debito, e o fluxo de caixa separa previsto, realizado e cancelado.</p>
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Custos por fornecedor</CardTitle>
          <Badge variant="outline">{data?.fornecedores.length ?? 0} fornecedor(es)</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : data?.fornecedores.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/25 text-left text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-4 font-medium">Fornecedor</th>
                    <th className="py-3 pr-4 font-medium">Lancamentos</th>
                    <th className="py-3 pr-4 font-medium">Total</th>
                    <th className="py-3 pr-4 font-medium">Pago</th>
                    <th className="py-3 pr-4 font-medium">Pendente</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fornecedores.slice(0, 12).map((fornecedor) => (
                    <tr key={fornecedor.nome} className="border-t odd:bg-background even:bg-muted/20">
                      <td className="py-3 pl-4 pr-4 font-medium">{fornecedor.nome}</td>
                      <td className="py-3 pr-4">{fornecedor.quantidade}</td>
                      <td className="py-3 pr-4 font-semibold">{formatarMoeda(fornecedor.total)}</td>
                      <td className="py-3 pr-4">{formatarMoeda(fornecedor.pago)}</td>
                      <td className="py-3 pr-4">{formatarMoeda(fornecedor.pendente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum fornecedor com contas no periodo selecionado.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Os nomes agora ficam padronizados a partir do cadastro de fornecedores do contas a pagar.</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Panorama financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                valor: { label: 'Valor', color: 'var(--chart-2)' },
              }}
            >
              <BarChart data={graficoGestao} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatarMoeda(Number(value)).replace('R$', 'R$ ')} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatarMoeda(Number(value))} />} />
                <Bar dataKey="valor" radius={[10, 10, 0, 0]}>
                  {graficoGestao.map((item) => (
                    <Cell key={item.chave} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Visao executiva para gestao: realizado mostra o que de fato entrou, previsto mostra o que ainda deve entrar, e cancelado evidencia a perda no periodo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Sabores e valores</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={handleExportProdutos} disabled={!data?.produtos.length}>
            <Download className="mr-2 h-4 w-4" /> Exportar tabela
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : data?.produtos.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-primary/10 text-left text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-4 font-medium">Sabor</th>
                    <th className="py-3 pr-4 font-medium">Qtd.</th>
                    <th className="py-3 pr-4 font-medium">Valor un.</th>
                    <th className="py-3 pr-4 font-medium">Total</th>
                    <th className="py-3 pr-4 font-medium">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.produtos.map((produto, index) => (
                    <tr key={produto.chave} className="border-t odd:bg-background even:bg-muted/20">
                      <td className="py-3 pl-4 pr-4 font-medium"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-warning/35 text-xs font-bold text-warning-foreground">{index + 1}</span>{produto.nomeProduto}</td>
                      <td className="py-3 pr-4 font-semibold">{produto.quantidade}</td>
                      <td className="py-3 pr-4">{formatarMoeda(produto.precoUnitario)}</td>
                      <td className="py-3 pr-4 font-semibold text-secondary">{formatarMoeda(produto.total)}</td>
                      <td className="py-3 pr-4">{produto.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/25 font-semibold">
                  <tr>
                    <td className="py-3 pl-4 pr-4">Total do periodo</td>
                    <td className="py-3 pr-4">{totalUnidades}</td>
                    <td className="py-3 pr-4">-</td>
                    <td className="py-3 pr-4 text-secondary">{formatarMoeda(data.produtos.reduce((acc, produto) => acc + produto.total, 0))}</td>
                    <td className="py-3 pr-4">{data.produtos.reduce((acc, produto) => acc + produto.pedidos, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum item encontrado para o periodo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Pedidos com pagamento pendente</CardTitle>
          <Badge variant="outline">{pedidosPendentes.length} pendente(s)</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : pedidosPendentes.length ? (
            <div className="space-y-3">
              {pedidosPendentes.map((pedido) => (
                <div key={`pendente-${pedido.id}`} className="rounded-xl border border-warning/35 bg-warning/5 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} - {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">Criado: {formatDateTimeInSaoPaulo(pedido.criadoEm)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{entregaLabels[pedido.tipoEntrega]}</Badge>
                      <Badge variant="outline">{statusPedidoReportLabels[pedido.status]}</Badge>
                      <Badge className="border-warning/30 bg-warning/15 text-warning-foreground hover:bg-warning/15 dark:bg-warning/20 dark:text-white">Pagamento pendente</Badge>
                      <Badge>{formatarMoeda(pedido.total)}</Badge>
                    </div>
                  </div>
                  {(pedido.responsavelPedido || pedido.destinatariosPedido || pedido.levadoEm || pedido.observacoesPedido) && (
                    <div className="mt-3 space-y-1 rounded-lg bg-background/80 p-3 text-sm text-muted-foreground">
                      {pedido.responsavelPedido && <p>Responsavel: {pedido.responsavelPedido}</p>}
                      {pedido.destinatariosPedido && <p>Separar para: {pedido.destinatariosPedido}</p>}
                      {pedido.levadoEm && <p>Levado em: {formatDateTimeInSaoPaulo(pedido.levadoEm)}</p>}
                      {pedido.observacoesPedido && <p>Obs. do pedido: {pedido.observacoesPedido}</p>}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => confirmarPagamento(pedido.id)}
                      disabled={updatingPaymentId === pedido.id}
                    >
                      {updatingPaymentId === pedido.id ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Dar baixa no pagamento
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido com pagamento pendente no periodo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Pedidos do periodo</CardTitle>
          <Badge variant="outline">{pedidosFiltrados.length} pedido(s)</Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            A listagem abre por padrao na semana atual, de domingo a sabado. Voce pode ajustar o periodo quando precisar.
          </div>
          <div className="mb-4 grid gap-3 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Periodo da listagem: de</Label>
              <Input type="date" value={listFromInput} onChange={(event) => setListFromInput(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Periodo da listagem: ate</Label>
              <Input type="date" value={listToInput} onChange={(event) => setListToInput(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Buscar no historico</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchPedidoInput} onChange={(event) => setSearchPedidoInput(event.target.value)} placeholder="Numero, cliente, telefone, responsavel ou item" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status do pagamento</Label>
              <Select value={statusPagamentoFiltroInput} onValueChange={(value) => setStatusPagamentoFiltroInput(value as 'TODOS' | StatusPagamento)}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="NAO_APLICAVEL">Na entrega</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="APROVADO">Aprovado</SelectItem>
                  <SelectItem value="RECUSADO">Recusado</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  <SelectItem value="REEMBOLSADO">Reembolsado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status do pedido</Label>
              <Select value={statusPedidoFiltroInput} onValueChange={(value) => setStatusPedidoFiltroInput(value as 'TODOS' | StatusPedido)}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="FEITO">Novos</SelectItem>
                  <SelectItem value="ACEITO">Aceitos</SelectItem>
                  <SelectItem value="PREPARACAO">Em preparo</SelectItem>
                  <SelectItem value="PRONTO_ENTREGA">Pronto entrega</SelectItem>
                  <SelectItem value="ENTREGUE">Entregues</SelectItem>
                  <SelectItem value="CANCELADO">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
            <Button type="button" className="w-full whitespace-nowrap" onClick={handleAplicarFiltrosPedidos} disabled={!filtrosPedidosPendentes}>
              <Search className="mr-2 h-4 w-4" /> Buscar pedidos
            </Button>
            <Button type="button" variant="outline" className="w-full whitespace-nowrap" onClick={filtrosPedidosPendentes ? handleLimparFiltrosPedidos : () => mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" /> {filtrosPedidosPendentes ? 'Limpar filtros' : 'Atualizar dados'}
            </Button>
          </div>

          {!isLoading && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Total filtrado</p>
                <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoFiltrado.total)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{pedidosFiltrados.length} pedido(s)</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Realizado no filtro</p>
                <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoFiltrado.realizado)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Ja entrou no caixa</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Previsto no filtro</p>
                <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoFiltrado.previsto)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Ainda em aberto</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Cancelado no filtro</p>
                <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoFiltrado.cancelado)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Saiu do fluxo</p>
              </div>
            </div>
          )}

          {!isLoading && pedidosFiltrados.length > 0 && (
            <div className="mb-5 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-4 font-medium">Pedido</th>
                    <th className="py-3 pr-4 font-medium">Data</th>
                    <th className="py-3 pr-4 font-medium">Cliente</th>
                    <th className="py-3 pr-4 font-medium">Responsavel</th>
                    <th className="py-3 pr-4 font-medium">Pagamento</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Entrega</th>
                    <th className="py-3 pr-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.map((pedido) => (
                    <tr key={`linha-${pedido.id}`} className="border-t odd:bg-background even:bg-muted/15">
                      <td className="py-3 pl-4 pr-4 font-semibold">#{pedido.numero}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateTimeInSaoPaulo(pedido.criadoEm)}</td>
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-medium">{pedido.clienteNome}</p>
                          <p className="text-xs text-muted-foreground">{formatarTelefone(pedido.clienteWhatsapp || pedido.clienteTelefone)}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4">{pedido.responsavelPedido || '-'}</td>
                      <td className="py-3 pr-4">
                        <div>
                          <p>{getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</p>
                          <p className="text-xs text-muted-foreground">{statusPagamentoLabels[pedido.statusPagamento]}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4">{statusPedidoReportLabels[pedido.status]}</td>
                      <td className="py-3 pr-4">{entregaLabels[pedido.tipoEntrega]}</td>
                      <td className="py-3 pr-4 font-semibold">{formatarMoeda(pedido.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : pedidosFiltrados.length ? (
            <div className="space-y-3">
              {pedidosFiltrados.map((pedido) => (
                <div key={pedido.id} className="rounded-xl border bg-card/80 p-4 transition-colors hover:border-primary/45">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} - {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        {pedido.tipoEntrega === 'ENCOMENDA' ? `Encomenda: ${formatDateTimeInSaoPaulo(pedido.encomendaPara)}` : `Criado: ${formatDateTimeInSaoPaulo(pedido.criadoEm)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pedido.tipoEntrega === 'ENCOMENDA' && <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">Encomenda</Badge>}
                      <Badge variant="outline">{entregaLabels[pedido.tipoEntrega]}</Badge>
                      <Badge className={statusPedidoReportStyles[pedido.status]} variant="outline">{statusPedidoReportLabels[pedido.status]}</Badge>
                      <Badge variant="outline">{statusPagamentoLabels[pedido.statusPagamento]}</Badge>
                      <Badge variant="outline">{getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</Badge>
                      <Badge>{formatarMoeda(pedido.total)}</Badge>
                    </div>
                  </div>
                  {(pedido.responsavelPedido || pedido.destinatariosPedido || pedido.levadoEm || pedido.observacoesPedido) && (
                    <div className="mt-3 space-y-1 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                      {pedido.responsavelPedido && <p>Responsavel: {pedido.responsavelPedido}</p>}
                      {pedido.destinatariosPedido && <p>Separar para: {pedido.destinatariosPedido}</p>}
                      {pedido.levadoEm && <p>Levado em: {formatDateTimeInSaoPaulo(pedido.levadoEm)}</p>}
                      {pedido.observacoesPedido && <p>Obs. do pedido: {pedido.observacoesPedido}</p>}
                    </div>
                  )}
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {pedido.itens.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3">
                        <span>{item.quantidade}x {item.nomeProduto} ({formatarMoeda(item.precoUnitario)} un.)</span>
                        <span className="font-medium text-foreground">{formatarMoeda(item.totalItem)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido encontrado com os filtros selecionados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
