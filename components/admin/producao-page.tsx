'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { CalendarDays, ChefHat, PackageCheck, ReceiptText } from 'lucide-react'
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
    nomeProduto: string
    quantidade: number
    totalItem: number
  }[]
}

type ProducaoData = {
  date: string
  totalPedidos: number
  totalItens: number
  totalAProduzir: number
  receitaTotal: number
  resumo: ProducaoResumoItem[]
  aProduzir: ProducaoResumoItem[]
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
  const [date, setDate] = useState(todayInSaoPaulo())
  const url = useMemo(() => `/api/admin/producao?date=${date}`, [date])
  const { data, isLoading, mutate } = useSWR<ProducaoData>(url, fetcher, {
    refreshInterval: 15000,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            ProduÃ§Ã£o
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quantidades por sabor e pedidos do dia.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="data-producao">Data</Label>
            <Input
              id="data-producao"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => mutate()}>
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <ReceiptText className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Pedidos</p>
                  <p className="text-2xl font-bold">{data?.totalPedidos ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Unidades</p>
                  <p className="text-2xl font-bold">{data?.totalItens ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Receita do dia</p>
                  <p className="text-2xl font-bold">{formatarMoeda(data?.receitaTotal ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>A produzir agora</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : data?.aProduzir.length ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm text-muted-foreground">Total pendente de producao</p>
                <p className="text-3xl font-bold text-primary">{data.totalAProduzir}</p>
              </div>
              {data.aProduzir.map((item) => (
                <div key={item.produtoId} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.nomeProduto}</p>
                    <p className="text-sm text-muted-foreground">
                      Ainda em {item.pedidos} pedido{item.pedidos === 1 ? '' : 's'} nao entregue{item.pedidos === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{item.quantidade}</p>
                    <p className="text-xs text-muted-foreground">a produzir</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tudo produzido/entregue para esta data. Pode comemorar: fila zerada.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo total do dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : data?.resumo.length ? (
            <div className="space-y-3">
              {data.resumo.map((item) => (
                <div key={item.produtoId} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.nomeProduto}</p>
                    <p className="text-sm text-muted-foreground">
                      Presente em {item.pedidos} pedido{item.pedidos === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{item.quantidade}</p>
                    <p className="text-xs text-muted-foreground">{formatarMoeda(item.receita)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido para produÃ§Ã£o nesta data.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos do dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : data?.pedidos.length ? (
            <div className="space-y-4">
              {data.pedidos.map((pedido) => (
                <div key={pedido.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">
                        #{pedido.numero} Â· {pedido.clienteNome}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatarHora(pedido.criadoEm)}
                        {pedido.tipoEntrega === 'RESERVA_PAULISTANO' && (
                          <> Â· Bloco {pedido.clienteBloco} Â· Apto {pedido.clienteApartamento}</>
                        )}
                        {pedido.tipoEntrega === 'ENCOMENDA' && (
                          <> · Encomenda para {formatarDataHora(pedido.encomendaPara)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {pedido.tipoEntrega === 'ENCOMENDA' && <Badge variant="secondary">Encomenda</Badge>}
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
            <p className="text-sm text-muted-foreground">Nenhum pedido nesta data.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
