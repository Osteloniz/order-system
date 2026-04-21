'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Archive, PackageCheck, RefreshCw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

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
  }[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar estoque')
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

export function EstoquePage() {
  const today = todayInSaoPaulo()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [productionDate, setProductionDate] = useState(today)
  const [productionDrafts, setProductionDrafts] = useState<Record<string, string>>({})
  const [savingProductionId, setSavingProductionId] = useState<string | null>(null)
  const [syncingLegacy, setSyncingLegacy] = useState(false)
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
        body: JSON.stringify({ action: 'ADD_PRODUCTION', produtoId, quantidade: Math.floor(quantidade), dataProducao: productionDate }),
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
      setMessage(`Sincronizacao concluida. ${result.sincronizados} pedidos ajustados de ${result.totalPendentes}.${bloqueados}`)
      await mutate()
      await globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao sincronizar pedidos antigos')
    } finally {
      setSyncingLegacy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Archive className="h-6 w-6 text-primary" />
            Estoque
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle a entrada de producao, veja o saldo projetado e sincronize pedidos antigos que ainda nao baixaram estoque.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_160px_160px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="estoque-data-inicio">De</Label>
            <Input id="estoque-data-inicio" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estoque-data-fim">Até</Label>
            <Input id="estoque-data-fim" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estoque-data-producao">Data produzida</Label>
            <Input id="estoque-data-producao" type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      <Card className={data?.pedidosLegadosPendentes ? 'border-warning/40 bg-warning/5' : 'border-border'}>
        <CardHeader>
          <CardTitle>Sincronizacao de pedidos antigos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{data?.pedidosLegadosPendentes ?? 0} pedidos antigos ainda nao baixaram estoque</p>
              <p className="text-sm text-muted-foreground">Use uma vez para aplicar a baixa dos pedidos antigos em ACEITO, PREPARACAO ou ENTREGUE.</p>
            </div>
            <Button type="button" onClick={syncLegacyStock} disabled={syncingLegacy || !data?.pedidosLegadosPendentes}>
              {syncingLegacy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Sincronizar pedidos antigos
            </Button>
          </div>

          {Boolean(data?.pedidosLegadosPendentesLista?.length) && (
            <div className="grid gap-2 md:grid-cols-2">
              {data?.pedidosLegadosPendentesLista.map((pedido) => (
                <div key={pedido.id} className="rounded-lg border border-warning/30 bg-background/80 p-3 text-sm">
                  <p className="font-semibold">#{pedido.numero} - {pedido.clienteNome}</p>
                  <p className="text-muted-foreground">Status atual: {pedido.status}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo por produto</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : data?.estoque.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.estoque.map((item) => (
                <div key={item.produtoId} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.nomeProduto}</p>
                      <p className="text-sm text-muted-foreground">{item.categoriaNome}</p>
                    </div>
                    {item.pendenteBaixaLegada > 0 && <Badge variant="secondary">Pendente legado {item.pendenteBaixaLegada}</Badge>}
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
                    <div className="rounded-lg bg-muted/35 p-3">
                      <p className="text-xs text-muted-foreground">Baixa legada pendente</p>
                      <p className="text-xl font-bold">{item.pendenteBaixaLegada}</p>
                    </div>
                    <div className="rounded-lg bg-muted/35 p-3">
                      <p className="text-xs text-muted-foreground">Saldo projetado</p>
                      <p className={`text-xl font-bold ${item.saldoProjetado < 0 ? 'text-destructive' : 'text-success'}`}>{item.saldoProjetado}</p>
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
    </div>
  )
}
