'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ClipboardList, History, PackageCheck, RefreshCw, ScanSearch, ShieldCheck, Warehouse } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

type LogItem = {
  id: string
  tipo: string
  produtoId: string | null
  produtoNome: string | null
  pedidoId: string | null
  pedidoNumero: string | null
  quantidade: number | null
  saldoDisponivel: number | null
  saldoReservado: number | null
  descricao: string
  actorNome: string | null
  criadoEm: string
}

type LogsData = {
  from: string
  to: string
  total: number
  resumo: {
    ajustes: number
    producoes: number
    baixasEntrega: number
    reservas: number
    pedidos: number
  }
  logs: LogItem[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar logs')
  return data
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatQuantidade(value: number | null) {
  if (value == null) return '-'
  return value > 0 ? `+${value}` : String(value)
}

const tipoOptions = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'AJUSTE_ESTOQUE', label: 'Ajustes manuais' },
  { value: 'REGISTRO_PRODUCAO', label: 'Produção' },
  { value: 'BAIXA_ESTOQUE_ENTREGA', label: 'Baixas na entrega' },
  { value: 'RESERVA_ENCOMENDA', label: 'Reservas de encomenda' },
  { value: 'LIBERACAO_RESERVA', label: 'Liberação de reserva' },
  { value: 'PEDIDO_CRIADO', label: 'Pedido criado' },
  { value: 'PEDIDO_EDITADO', label: 'Pedido editado' },
  { value: 'PEDIDO_STATUS_ALTERADO', label: 'Status alterado' },
]

export function LogsPage() {
  const today = todayInSaoPaulo()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [tipo, setTipo] = useState('TODOS')
  const [busca, setBusca] = useState('')

  const url = useMemo(() => {
    const search = new URLSearchParams({ from, to })
    if (tipo !== 'TODOS') search.set('tipo', tipo)
    if (busca.trim()) search.set('busca', busca.trim())
    return `/api/admin/logs?${search.toString()}`
  }, [busca, from, tipo, to])

  const { data, isLoading, mutate } = useSWR<LogsData>(url, fetcher, {
    refreshInterval: 20000,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <History className="h-6 w-6 text-primary" />
            Logs operacionais
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rastreie ajustes de saldo, producao, reservas, entregas e alteracoes importantes dos pedidos.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_160px_220px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="logs-from">De</Label>
            <Input id="logs-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-to">Até</Label>
            <Input id="logs-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-busca">Busca</Label>
            <Input
              id="logs-busca"
              placeholder="Pedido, produto, descricao ou responsavel"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo do período</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
            <ScanSearch className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">Eventos rastreados</p>
            <p className="text-2xl font-bold">{data?.total ?? 0}</p>
          </div>
          <div className="rounded-xl border border-amber-300/35 bg-amber-50 p-4">
            <ShieldCheck className="mb-3 h-5 w-5 text-amber-700" />
            <p className="text-sm text-muted-foreground">Ajustes manuais</p>
            <p className="text-2xl font-bold">{data?.resumo.ajustes ?? 0}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/35 bg-emerald-50 p-4">
            <PackageCheck className="mb-3 h-5 w-5 text-emerald-700" />
            <p className="text-sm text-muted-foreground">Produções</p>
            <p className="text-2xl font-bold">{data?.resumo.producoes ?? 0}</p>
          </div>
          <div className="rounded-xl border border-sky-300/35 bg-sky-50 p-4">
            <Warehouse className="mb-3 h-5 w-5 text-sky-700" />
            <p className="text-sm text-muted-foreground">Baixas na entrega</p>
            <p className="text-2xl font-bold">{data?.resumo.baixasEntrega ?? 0}</p>
          </div>
          <div className="rounded-xl border border-fuchsia-300/35 bg-fuchsia-50 p-4">
            <ClipboardList className="mb-3 h-5 w-5 text-fuchsia-700" />
            <p className="text-sm text-muted-foreground">Eventos de pedido</p>
            <p className="text-2xl font-bold">{data?.resumo.pedidos ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico detalhado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[260px_auto]">
            <div className="space-y-2">
              <Label htmlFor="logs-tipo">Tipo de evento</Label>
              <select
                id="logs-tipo"
                value={tipo}
                onChange={(event) => setTipo(event.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {tipoOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              O log registra quem alterou o saldo, quando a producao entrou no estoque, quando uma encomenda reservou unidades e quando a baixa real aconteceu na entrega.
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : data?.logs.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Quando</th>
                    <th className="px-4 py-3 font-medium">Evento</th>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium">Pedido</th>
                    <th className="px-4 py-3 font-medium">Qtd.</th>
                    <th className="px-4 py-3 font-medium">Saldos</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id} className="border-t align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.criadoEm)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{log.tipo.replaceAll('_', ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3">{log.produtoNome ?? '-'}</td>
                      <td className="px-4 py-3">{log.pedidoNumero ? `#${log.pedidoNumero}` : '-'}</td>
                      <td className="px-4 py-3 font-medium">{formatQuantidade(log.quantidade)}</td>
                      <td className="px-4 py-3">
                        <div>Disp.: {log.saldoDisponivel ?? '-'}</div>
                        <div>Res.: {log.saldoReservado ?? '-'}</div>
                      </td>
                      <td className="px-4 py-3">{log.actorNome ?? 'Sistema'}</td>
                      <td className="px-4 py-3 min-w-[320px]">{log.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado para os filtros escolhidos.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
