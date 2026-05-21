'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ArrowDownCircle, ArrowUpCircle, CalendarRange, Filter, Landmark, RefreshCw, Search, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda } from '@/lib/calc'
import { formatDateInSaoPaulo, getCurrentWeekRangeInSaoPaulo } from '@/lib/sao-paulo'

type FluxoDia = {
  data: string
  entradasPrevistas: number
  entradasRealizadas: number
  saidasPrevistas: number
  saidasRealizadas: number
  taxasPrevistas: number
  taxasRealizadas: number
  saldoPrevisto: number
  saldoRealizado: number
}

type FluxoCaixaData = {
  from: string
  to: string
  resumo: {
    entradasPrevistas: number
    entradasRealizadas: number
    saidasPrevistas: number
    saidasRealizadas: number
    taxasPrevistas: number
    taxasRealizadas: number
    saldoPrevisto: number
    saldoRealizado: number
  }
  dias: FluxoDia[]
}

type VisualizacaoFluxo = 'AMBOS' | 'PREVISTO' | 'REALIZADO'

type PeriodoRapido = 'SEMANA' | 'MES' | 'TRIMESTRE' | 'SEMESTRE' | 'ANO'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar fluxo de caixa')
  return data
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getRangeForPreset(preset: PeriodoRapido) {
  const now = new Date()

  if (preset === 'SEMANA') {
    return getCurrentWeekRangeInSaoPaulo()
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let start = new Date(end)

  if (preset === 'MES') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end.setMonth(now.getMonth() + 1, 0)
  }

  if (preset === 'TRIMESTRE') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    start = new Date(now.getFullYear(), quarterStartMonth, 1)
    end.setMonth(quarterStartMonth + 3, 0)
  }

  if (preset === 'SEMESTRE') {
    const semesterStartMonth = now.getMonth() < 6 ? 0 : 6
    start = new Date(now.getFullYear(), semesterStartMonth, 1)
    end.setMonth(semesterStartMonth + 6, 0)
  }

  if (preset === 'ANO') {
    start = new Date(now.getFullYear(), 0, 1)
    end.setMonth(12, 0)
  }

  return {
    from: formatIsoDate(start),
    to: formatIsoDate(end),
  }
}

function getDiffInDays(from: string, to: string) {
  const start = new Date(`${from}T12:00:00-03:00`)
  const end = new Date(`${to}T12:00:00-03:00`)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

export function FluxoCaixaPage() {
  const currentWeek = getCurrentWeekRangeInSaoPaulo()
  const [fromInput, setFromInput] = useState(currentWeek.from)
  const [toInput, setToInput] = useState(currentWeek.to)
  const [viewInput, setViewInput] = useState<VisualizacaoFluxo>('AMBOS')
  const [from, setFrom] = useState(currentWeek.from)
  const [to, setTo] = useState(currentWeek.to)
  const [view, setView] = useState<VisualizacaoFluxo>('AMBOS')
  const periodoPendente = from !== fromInput || to !== toInput || view !== viewInput

  const url = useMemo(() => `/api/admin/financeiro/fluxo-caixa?from=${from}&to=${to}`, [from, to])
  const { data, isLoading, mutate } = useSWR<FluxoCaixaData>(url, fetcher)

  const aplicarPeriodo = () => {
    setFrom(fromInput)
    setTo(toInput)
    setView(viewInput)
  }

  const aplicarPeriodoRapido = (preset: PeriodoRapido) => {
    const range = getRangeForPreset(preset)
    setFromInput(range.from)
    setToInput(range.to)
    setFrom(range.from)
    setTo(range.to)
  }

  const cardsResumo = [
    {
      key: 'previsto',
      visible: view !== 'REALIZADO',
      title: 'Entradas previstas',
      value: formatarMoeda(data?.resumo.entradasPrevistas ?? 0),
      detail: `Taxas: ${formatarMoeda(data?.resumo.taxasPrevistas ?? 0)}`,
      icon: ArrowUpCircle,
      tone: 'text-primary',
    },
    {
      key: 'realizado',
      visible: view !== 'PREVISTO',
      title: 'Entradas realizadas',
      value: formatarMoeda(data?.resumo.entradasRealizadas ?? 0),
      detail: `Taxas: ${formatarMoeda(data?.resumo.taxasRealizadas ?? 0)}`,
      icon: Wallet,
      tone: 'text-success',
    },
    {
      key: 'saidas',
      visible: view === 'AMBOS' || view === 'PREVISTO',
      title: view === 'REALIZADO' ? 'Saidas realizadas' : 'Saidas previstas',
      value: formatarMoeda(view === 'REALIZADO' ? data?.resumo.saidasRealizadas ?? 0 : data?.resumo.saidasPrevistas ?? 0),
      detail: view === 'REALIZADO' ? 'Pagamentos ja baixados' : 'Contas ainda abertas',
      icon: ArrowDownCircle,
      tone: 'text-destructive',
    },
    {
      key: 'saldo',
      visible: true,
      title: view === 'PREVISTO' ? 'Saldo previsto' : 'Saldo realizado',
      value: formatarMoeda(view === 'PREVISTO' ? data?.resumo.saldoPrevisto ?? 0 : data?.resumo.saldoRealizado ?? 0),
      detail: view === 'AMBOS'
        ? `Saldo previsto: ${formatarMoeda(data?.resumo.saldoPrevisto ?? 0)}`
        : 'Leitura consolidada do periodo',
      icon: Landmark,
      tone: 'text-primary',
    },
  ].filter((card) => card.visible)

  const totalDias = getDiffInDays(fromInput, toInput)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/15 bg-card/95">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm shadow-primary/20">
                <Landmark className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Fluxo de caixa</h1>
                <p className="text-sm text-muted-foreground">Analise detalhada do caixa projetado e realizado sem perder o contexto dos pedidos e das saidas.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-muted-foreground">
            Periodo padrao: semana atual, de domingo a sabado.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
              <Filter className="h-5 w-5" />
            </span>
            Configuracoes e filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CalendarRange className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold">Periodo de analise</h3>
                <p className="text-sm text-muted-foreground">Selecione a visualizacao, use um atalho rapido e ajuste o intervalo quando precisar.</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                <Label>Visualizacao</Label>
                <Select value={viewInput} onValueChange={(value) => setViewInput(value as VisualizacaoFluxo)}>
                  <SelectTrigger className="w-full bg-background/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PREVISTO">Previsto</SelectItem>
                    <SelectItem value="REALIZADO">Realizado</SelectItem>
                    <SelectItem value="AMBOS">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Periodos rapidos</Label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <Button type="button" variant="outline" onClick={() => aplicarPeriodoRapido('SEMANA')}>Esta semana</Button>
                    <Button type="button" variant="outline" onClick={() => aplicarPeriodoRapido('MES')}>Este mes</Button>
                    <Button type="button" variant="outline" onClick={() => aplicarPeriodoRapido('TRIMESTRE')}>Trimestre</Button>
                    <Button type="button" variant="outline" onClick={() => aplicarPeriodoRapido('SEMESTRE')}>Semestre</Button>
                    <Button type="button" variant="outline" onClick={() => aplicarPeriodoRapido('ANO')}>Este ano</Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data inicio</Label>
                    <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data fim</Label>
                    <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3 text-sm text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  Periodo selecionado: {formatDateInSaoPaulo(fromInput)} ate {formatDateInSaoPaulo(toInput)}
                  <span className="ml-auto text-xs">({totalDias} dia(s))</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={aplicarPeriodo} disabled={!periodoPendente}>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={
                      periodoPendente
                        ? () => {
                            setFromInput(currentWeek.from)
                            setToInput(currentWeek.to)
                            setViewInput('AMBOS')
                            setFrom(currentWeek.from)
                            setTo(currentWeek.to)
                            setView('AMBOS')
                          }
                        : () => mutate()
                    }
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {periodoPendente ? 'Limpar filtros' : 'Atualizar'}
                  </Button>
                </div>
              </div>
            </div>
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
        <div className={`grid gap-4 ${cardsResumo.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4'} sm:grid-cols-2`}>
          {cardsResumo.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.key} className="border-border/70 bg-card/95">
                <CardContent className="p-5">
                  <Icon className={`mb-3 h-5 w-5 ${card.tone}`} />
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="mt-1 text-3xl font-bold">{card.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="border-border/70 bg-card/95">
        <CardHeader><CardTitle>Evolucao do caixa</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                saldoPrevisto: { label: 'Saldo previsto', color: '#5B7CFF' },
                saldoRealizado: { label: 'Saldo realizado', color: '#22C7B7' },
              }}
            >
              <AreaChart data={data?.dias ?? []} margin={{ left: 12, right: 12, top: 12, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="data" tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(5)} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatarMoeda(Number(value)).replace('R$', 'R$ ')} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatarMoeda(Number(value))} />} />
                {view !== 'REALIZADO' ? (
                  <Area type="monotone" dataKey="saldoPrevisto" stroke="#5B7CFF" fill="#5B7CFF" fillOpacity={0.18} />
                ) : null}
                {view !== 'PREVISTO' ? (
                  <Area type="monotone" dataKey="saldoRealizado" stroke="#22C7B7" fill="#22C7B7" fillOpacity={0.18} />
                ) : null}
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95">
        <CardHeader><CardTitle>Movimento por dia</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : data?.dias.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className={`w-full text-sm ${view === 'AMBOS' ? 'min-w-[1100px]' : 'min-w-[760px]'}`}>
                <thead className="bg-muted/35 text-left text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-4 font-medium">Data</th>
                    {view !== 'REALIZADO' ? <th className="py-3 pr-4 font-medium">Entradas previstas</th> : null}
                    {view !== 'PREVISTO' ? <th className="py-3 pr-4 font-medium">Entradas realizadas</th> : null}
                    {view !== 'REALIZADO' ? <th className="py-3 pr-4 font-medium">Saidas previstas</th> : null}
                    {view !== 'PREVISTO' ? <th className="py-3 pr-4 font-medium">Saidas realizadas</th> : null}
                    {view !== 'REALIZADO' ? <th className="py-3 pr-4 font-medium">Taxas previstas</th> : null}
                    {view !== 'PREVISTO' ? <th className="py-3 pr-4 font-medium">Taxas realizadas</th> : null}
                    {view !== 'REALIZADO' ? <th className="py-3 pr-4 font-medium">Saldo previsto</th> : null}
                    {view !== 'PREVISTO' ? <th className="py-3 pr-4 font-medium">Saldo realizado</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.dias.map((dia) => (
                    <tr key={dia.data} className="border-t odd:bg-background even:bg-muted/15">
                      <td className="py-3 pl-4 pr-4 font-medium">{formatDateInSaoPaulo(dia.data)}</td>
                      {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(dia.entradasPrevistas)}</td> : null}
                      {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(dia.entradasRealizadas)}</td> : null}
                      {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(dia.saidasPrevistas)}</td> : null}
                      {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(dia.saidasRealizadas)}</td> : null}
                      {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(dia.taxasPrevistas)}</td> : null}
                      {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(dia.taxasRealizadas)}</td> : null}
                      {view !== 'REALIZADO' ? <td className="py-3 pr-4 font-semibold text-primary">{formatarMoeda(dia.saldoPrevisto)}</td> : null}
                      {view !== 'PREVISTO' ? <td className="py-3 pr-4 font-semibold text-success">{formatarMoeda(dia.saldoRealizado)}</td> : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/35 font-semibold">
                    <td className="py-3 pl-4 pr-4">Saldo final</td>
                    {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.entradasPrevistas)}</td> : null}
                    {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.entradasRealizadas)}</td> : null}
                    {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.saidasPrevistas)}</td> : null}
                    {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.saidasRealizadas)}</td> : null}
                    {view !== 'REALIZADO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.taxasPrevistas)}</td> : null}
                    {view !== 'PREVISTO' ? <td className="py-3 pr-4">{formatarMoeda(data.resumo.taxasRealizadas)}</td> : null}
                    {view !== 'REALIZADO' ? <td className="py-3 pr-4 text-primary">{formatarMoeda(data.resumo.saldoPrevisto)}</td> : null}
                    {view !== 'PREVISTO' ? <td className="py-3 pr-4 text-success">{formatarMoeda(data.resumo.saldoRealizado)}</td> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum movimento financeiro encontrado para o periodo.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
