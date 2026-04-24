'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BarChart3, Download, PackageCheck, ReceiptText, RefreshCw, Sparkles, TrendingUp, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda } from '@/lib/calc'
import type { StatusPagamento, StatusPedido, TipoEntrega } from '@/lib/types'

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

const statusLabels: Record<StatusPedido, string> = {
  FEITO: 'Novos',
  ACEITO: 'Aceitos',
  PREPARACAO: 'Em preparo',
  ENTREGUE: 'Entregues',
  CANCELADO: 'Cancelados',
}

const statusStyles: Record<StatusPedido, string> = {
  FEITO: 'border-[#F8CF40]/50 bg-[#F8CF40]/15 text-[#7a5713]',
  ACEITO: 'border-[#FF6BBB]/45 bg-[#FF6BBB]/12 text-[#8a2861]',
  PREPARACAO: 'border-[#22C0D4]/45 bg-[#22C0D4]/12 text-[#0e6c77]',
  ENTREGUE: 'border-[#AF6E2A]/45 bg-[#AF6E2A]/12 text-[#744516]',
  CANCELADO: 'border-destructive/35 bg-destructive/10 text-destructive',
}

const entregaLabels: Record<TipoEntrega, string> = {
  RESERVA_PAULISTANO: 'Condominio',
  RETIRADA: 'Retirada',
  ENCOMENDA: 'Encomenda',
}

const statusPagamentoLabels: Record<StatusPagamento, string> = {
  NAO_APLICAVEL: 'Na entrega',
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
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

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
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
  const today = todayInSaoPaulo()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [statusPagamentoFiltro, setStatusPagamentoFiltro] = useState<'TODOS' | StatusPagamento>('TODOS')
  const [statusPedidoFiltro, setStatusPedidoFiltro] = useState<'TODOS' | StatusPedido>('TODOS')
  const url = useMemo(() => `/api/admin/relatorios?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<RelatorioData>(url, fetcher)

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
      if (statusPagamentoFiltro !== 'TODOS' && pedido.statusPagamento !== statusPagamentoFiltro) return false
      if (statusPedidoFiltro !== 'TODOS' && pedido.status !== statusPedidoFiltro) return false
      return true
    })
  }, [data?.pedidos, statusPagamentoFiltro, statusPedidoFiltro])

  const handleExportProdutos = () => {
    if (!data?.produtos.length) return

    downloadCsv(`relatorio-sabores-${from}-a-${to}.csv`, [
      ['Periodo', `${from} ate ${to}`],
      ['Ticket medio entregue', moneyForCsv(data.ticketMedioEntregue)],
      ['Receita entregue', moneyForCsv(data.receitaEntregue)],
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

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border bg-[linear-gradient(135deg,rgba(34,192,212,0.16),rgba(255,107,187,0.10)_40%,rgba(248,207,64,0.18))] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="mb-3 bg-[#AF6E2A] text-white hover:bg-[#AF6E2A]">
              <Sparkles className="mr-1 h-3 w-3" /> Inteligencia do dia
            </Badge>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <BarChart3 className="h-7 w-7 text-[#22C0D4]" />
              Relatorios
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Acompanhe faturamento, ticket medio, sabores mais vendidos e exporte os dados para planilha.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[180px_180px_auto_auto] sm:items-end">
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ate</Label>
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button type="button" onClick={handleExportProdutos} disabled={!data?.produtos.length}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="border-[#22C0D4]/35 bg-[#22C0D4]/10"><CardContent className="p-5"><ReceiptText className="mb-3 h-5 w-5 text-[#22C0D4]" /><p className="text-sm text-muted-foreground">Pedidos no periodo</p><p className="text-3xl font-bold">{data?.totalPedidos ?? 0}</p><p className="mt-2 text-xs text-muted-foreground">{entregues} entregues</p></CardContent></Card>
          <Card className="border-[#AF6E2A]/35 bg-[#AF6E2A]/10"><CardContent className="p-5"><PackageCheck className="mb-3 h-5 w-5 text-[#AF6E2A]" /><p className="text-sm text-muted-foreground">Receita entregue</p><p className="text-3xl font-bold">{formatarMoeda(data?.receitaEntregue ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Base para resultado real</p></CardContent></Card>
          <Card className="border-[#F8CF40]/45 bg-[#F8CF40]/15"><CardContent className="p-5"><TrendingUp className="mb-3 h-5 w-5 text-[#AF6E2A]" /><p className="text-sm text-muted-foreground">Ticket medio</p><p className="text-3xl font-bold">{formatarMoeda(data?.ticketMedioEntregue ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Sobre pedidos entregues</p></CardContent></Card>
          <Card className="border-[#FF6BBB]/35 bg-[#FF6BBB]/10"><CardContent className="p-5"><BarChart3 className="mb-3 h-5 w-5 text-[#FF6BBB]" /><p className="text-sm text-muted-foreground">Unidades vendidas</p><p className="text-3xl font-bold">{totalUnidades}</p><p className="mt-2 text-xs text-muted-foreground">Somando todos os sabores</p></CardContent></Card>
          <Card className="border-[#0e6c77]/25 bg-[#22C0D4]/5"><CardContent className="p-5"><PackageCheck className="mb-3 h-5 w-5 text-[#0e6c77]" /><p className="text-sm text-muted-foreground">Cartao bruto</p><p className="text-3xl font-bold">{formatarMoeda(data?.receitaCartaoBruta ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Somente pedidos entregues no cartao</p></CardContent></Card>
          <Card className="border-[#0e6c77]/25 bg-[#0e6c77]/10"><CardContent className="p-5"><TrendingUp className="mb-3 h-5 w-5 text-[#0e6c77]" /><p className="text-sm text-muted-foreground">Cartao liquido</p><p className="text-3xl font-bold">{formatarMoeda(data?.receitaCartaoLiquida ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Ja descontando 3,09% ({formatarMoeda(data?.taxaCartao ?? 0)})</p></CardContent></Card>
          <Card className="border-warning/35 bg-warning/10"><CardContent className="p-5"><ReceiptText className="mb-3 h-5 w-5 text-warning-foreground" /><p className="text-sm text-muted-foreground">Pagamentos pendentes</p><p className="text-3xl font-bold">{data?.pagamentosPendentes ?? 0}</p><p className="mt-2 text-xs text-muted-foreground">Use a tela de pedidos para cobrar ou ajustar</p></CardContent></Card>
          <Card className="border-destructive/25 bg-destructive/10"><CardContent className="p-5"><XCircle className="mb-3 h-5 w-5 text-destructive" /><p className="text-sm text-muted-foreground">Valor cancelado</p><p className="text-3xl font-bold">{formatarMoeda(data?.totalCancelado ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Pedidos cancelados</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/25"><CardTitle>Status do periodo</CardTitle></CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-1">
            {(Object.keys(statusLabels) as StatusPedido[]).map((status) => (
              <div key={status} className={`rounded-xl border p-4 ${statusStyles[status]}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{statusLabels[status]}</p>
                  <p className="text-2xl font-bold">{data?.porStatus?.[status] ?? 0}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#F8CF40]/40 bg-[linear-gradient(145deg,rgba(248,207,64,0.18),rgba(34,192,212,0.08))]">
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
            <p className="text-xs text-muted-foreground">Dica: o cartao liquido ja considera a taxa de 3,09%; pagamentos pendentes podem ser cobrados e ajustados na tela de pedidos.</p>
          </CardContent>
        </Card>
      </div>

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
                <thead className="bg-[#22C0D4]/10 text-left text-muted-foreground">
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
                      <td className="py-3 pl-4 pr-4 font-medium"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F8CF40]/35 text-xs font-bold">{index + 1}</span>{produto.nomeProduto}</td>
                      <td className="py-3 pr-4 font-semibold">{produto.quantidade}</td>
                      <td className="py-3 pr-4">{formatarMoeda(produto.precoUnitario)}</td>
                      <td className="py-3 pr-4 font-semibold text-[#AF6E2A]">{formatarMoeda(produto.total)}</td>
                      <td className="py-3 pr-4">{produto.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
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
                      <p className="text-sm text-muted-foreground">Criado: {formatDateTime(pedido.criadoEm)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{entregaLabels[pedido.tipoEntrega]}</Badge>
                      <Badge variant="outline">{statusLabels[pedido.status]}</Badge>
                      <Badge className="border-warning/30 bg-warning/15 text-warning-foreground hover:bg-warning/15">Pagamento pendente</Badge>
                      <Badge>{formatarMoeda(pedido.total)}</Badge>
                    </div>
                  </div>
                  {(pedido.responsavelPedido || pedido.destinatariosPedido || pedido.levadoEm || pedido.observacoesPedido) && (
                    <div className="mt-3 space-y-1 rounded-lg bg-background/80 p-3 text-sm text-muted-foreground">
                      {pedido.responsavelPedido && <p>Responsavel: {pedido.responsavelPedido}</p>}
                      {pedido.destinatariosPedido && <p>Separar para: {pedido.destinatariosPedido}</p>}
                      {pedido.levadoEm && <p>Levado em: {formatDateTime(pedido.levadoEm)}</p>}
                      {pedido.observacoesPedido && <p>Obs. do pedido: {pedido.observacoesPedido}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido com pagamento pendente no periodo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pedidos do periodo</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status do pagamento</Label>
              <select value={statusPagamentoFiltro} onChange={(event) => setStatusPagamentoFiltro(event.target.value as 'TODOS' | StatusPagamento)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="TODOS">Todos</option>
                <option value="NAO_APLICAVEL">Na entrega</option>
                <option value="PENDENTE">Pendente</option>
                <option value="APROVADO">Aprovado</option>
                <option value="RECUSADO">Recusado</option>
                <option value="CANCELADO">Cancelado</option>
                <option value="REEMBOLSADO">Reembolsado</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Status do pedido</Label>
              <select value={statusPedidoFiltro} onChange={(event) => setStatusPedidoFiltro(event.target.value as 'TODOS' | StatusPedido)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="TODOS">Todos</option>
                <option value="FEITO">Novos</option>
                <option value="ACEITO">Aceitos</option>
                <option value="PREPARACAO">Em preparo</option>
                <option value="ENTREGUE">Entregues</option>
                <option value="CANCELADO">Cancelados</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : pedidosFiltrados.length ? (
            <div className="space-y-3">
              {pedidosFiltrados.map((pedido) => (
                <div key={pedido.id} className="rounded-xl border bg-card/80 p-4 transition-colors hover:border-[#22C0D4]/45">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} - {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        {pedido.tipoEntrega === 'ENCOMENDA' ? `Encomenda: ${formatDateTime(pedido.encomendaPara)}` : `Criado: ${formatDateTime(pedido.criadoEm)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pedido.tipoEntrega === 'ENCOMENDA' && <Badge className="bg-[#FF6BBB] text-white hover:bg-[#FF6BBB]">Encomenda</Badge>}
                      <Badge variant="outline">{entregaLabels[pedido.tipoEntrega]}</Badge>
                      <Badge className={statusStyles[pedido.status]} variant="outline">{statusLabels[pedido.status]}</Badge>
                      <Badge variant="outline">{statusPagamentoLabels[pedido.statusPagamento]}</Badge>
                      <Badge>{formatarMoeda(pedido.total)}</Badge>
                    </div>
                  </div>
                  {(pedido.responsavelPedido || pedido.destinatariosPedido || pedido.levadoEm || pedido.observacoesPedido) && (
                    <div className="mt-3 space-y-1 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                      {pedido.responsavelPedido && <p>Responsavel: {pedido.responsavelPedido}</p>}
                      {pedido.destinatariosPedido && <p>Separar para: {pedido.destinatariosPedido}</p>}
                      {pedido.levadoEm && <p>Levado em: {formatDateTime(pedido.levadoEm)}</p>}
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
