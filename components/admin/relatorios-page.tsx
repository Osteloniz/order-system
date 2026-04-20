'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BarChart3, PackageCheck, ReceiptText, XCircle } from 'lucide-react'
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

export function RelatoriosPage() {
  const today = todayInSaoPaulo()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const url = useMemo(() => `/api/admin/relatorios?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<RelatorioData>(url, fetcher)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatorios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte pedidos por periodo, sabores, valores unitarios e totais.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[180px_180px_auto] sm:items-end">
          <div className="space-y-2">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ate</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => mutate()}>Atualizar</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-5"><ReceiptText className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Pedidos no periodo</p><p className="text-2xl font-bold">{data?.totalPedidos ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><PackageCheck className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Receita entregue</p><p className="text-2xl font-bold">{formatarMoeda(data?.receitaEntregue ?? 0)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><BarChart3 className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Receita geral</p><p className="text-2xl font-bold">{formatarMoeda(data?.receitaTotal ?? 0)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><XCircle className="mb-3 h-5 w-5 text-destructive" /><p className="text-sm text-muted-foreground">Valor cancelado</p><p className="text-2xl font-bold">{formatarMoeda(data?.totalCancelado ?? 0)}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Status do periodo</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(statusLabels) as StatusPedido[]).map((status) => (
            <div key={status} className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{statusLabels[status]}</p>
              <p className="text-2xl font-bold">{data?.porStatus?.[status] ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sabores e valores</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : data?.produtos.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Sabor</th>
                    <th className="py-3 pr-4 font-medium">Qtd.</th>
                    <th className="py-3 pr-4 font-medium">Valor un.</th>
                    <th className="py-3 pr-4 font-medium">Total</th>
                    <th className="py-3 pr-4 font-medium">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.produtos.map((produto) => (
                    <tr key={produto.chave} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{produto.nomeProduto}</td>
                      <td className="py-3 pr-4">{produto.quantidade}</td>
                      <td className="py-3 pr-4">{formatarMoeda(produto.precoUnitario)}</td>
                      <td className="py-3 pr-4 font-semibold">{formatarMoeda(produto.total)}</td>
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
        <CardHeader><CardTitle>Pedidos do periodo</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : data?.pedidos.length ? (
            <div className="space-y-3">
              {data.pedidos.map((pedido) => (
                <div key={pedido.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">#{pedido.numero} - {pedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">
                        {pedido.tipoEntrega === 'ENCOMENDA' ? `Encomenda: ${formatDateTime(pedido.encomendaPara)}` : `Criado: ${formatDateTime(pedido.criadoEm)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pedido.tipoEntrega === 'ENCOMENDA' && <Badge variant="secondary">Encomenda</Badge>}
                      <Badge variant="outline">{statusLabels[pedido.status]}</Badge>
                      <Badge>{formatarMoeda(pedido.total)}</Badge>
                    </div>
                  </div>
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
            <p className="text-sm text-muted-foreground">Nenhum pedido encontrado para o periodo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
