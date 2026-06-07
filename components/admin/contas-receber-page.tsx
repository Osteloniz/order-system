'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BadgeDollarSign, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { contaReceberStatusLabels } from '@/lib/finance'
import { getPagamentoLabel, statusPagamentoLabels, statusPedidoReportLabels } from '@/lib/order-display'
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
    },
    {
      titulo: 'Realizado',
      valor: formatarMoeda(data?.resumo.realizado ?? 0),
      detalhe: `Liquido: ${formatarMoeda(data?.resumo.realizadoLiquido ?? 0)}`,
    },
    {
      titulo: 'Taxas do periodo',
      valor: formatarMoeda(data?.resumo.totalTaxas ?? 0),
      detalhe: 'Cartao credito e debito',
    },
    {
      titulo: 'Titulos no filtro',
      valor: String(data?.totalRegistros ?? 0),
      detalhe: `Cancelado: ${formatarMoeda(data?.resumo.cancelado ?? 0)}`,
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
    <div className="space-y-6">
      <div className="rounded-3xl border bg-card/90 p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <BadgeDollarSign className="h-6 w-6 text-primary" />
              Contas a receber
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja o que ainda vai entrar, o que ja entrou e o impacto das taxas de cartao.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_160px_220px_auto_auto]">
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ate</Label>
              <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status financeiro</Label>
              <Select value={statusInput} onValueChange={(value) => setStatusInput(value as typeof statusInput)}>
                <SelectTrigger>
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
            <Button className="xl:self-end" onClick={aplicarFiltros} disabled={!periodoPendente}>
              <Search className="mr-2 h-4 w-4" />
              Buscar
            </Button>
            <Button className="xl:self-end" variant="outline" onClick={resetarOuAtualizar}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {periodoPendente ? 'Limpar' : 'Atualizar'}
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cardsResumo.map((card) => (
            <Card key={card.titulo}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{card.titulo}</p>
                <p className="mt-1 text-3xl font-bold">{card.valor}</p>
                <p className="mt-2 text-xs text-muted-foreground">{card.detalhe}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Lista de recebimentos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Busca rapida e totais aplicados sobre os registros visiveis.
            </p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por pedido, cliente ou pagamento"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Bruto filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.total)}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Taxa filtrada</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.taxa)}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Liquido filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.liquido)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : contasFiltradas.length ? (
            <div className="overflow-x-auto rounded-xl border">
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
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateInSaoPaulo(conta.dataCompetencia)}</td>
                      <td className="py-3 pr-4">{getPagamentoLabel(conta.pagamento, conta.tipoCartao)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{contaReceberStatusLabels[conta.statusFinanceiro]}</Badge>
                          <Badge variant="outline">{statusPedidoReportLabels[conta.statusPedido]}</Badge>
                          <Badge variant="outline">{statusPagamentoLabels[conta.statusPagamento]}</Badge>
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
