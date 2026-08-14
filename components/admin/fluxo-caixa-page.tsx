'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  Filter,
  Landmark,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react'
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

  const resetarOuAtualizar = () => {
    if (periodoPendente) {
      setFromInput(currentWeek.from)
      setToInput(currentWeek.to)
      setViewInput('AMBOS')
      setFrom(currentWeek.from)
      setTo(currentWeek.to)
      setView('AMBOS')
      return
    }

    void mutate()
  }

  const cardsResumo = [
    {
      key: 'previsto',
      visible: view !== 'REALIZADO',
      title: 'Entradas previstas',
      value: formatarMoeda(data?.resumo.entradasPrevistas ?? 0),
      detail: `Taxas previstas: ${formatarMoeda(data?.resumo.taxasPrevistas ?? 0)}`,
      icon: ArrowUpCircle,
      tone: 'text-primary',
    },
    {
      key: 'realizado',
      visible: view !== 'PREVISTO',
      title: 'Entradas realizadas',
      value: formatarMoeda(data?.resumo.entradasRealizadas ?? 0),
      detail: `Taxas realizadas: ${formatarMoeda(data?.resumo.taxasRealizadas ?? 0)}`,
      icon: Wallet,
      tone: 'text-success',
    },
    {
      key: 'saidas',
      visible: view === 'AMBOS' || view === 'PREVISTO',
      title: view === 'REALIZADO' ? 'Saidas realizadas' : 'Saidas previstas',
      value: formatarMoeda(view === 'REALIZADO' ? data?.resumo.saidasRealizadas ?? 0 : data?.resumo.saidasPrevistas ?? 0),
      detail: view === 'REALIZADO' ? 'Pagamentos ja liquidados' : 'Compromissos ainda em aberto',
      icon: ArrowDownCircle,
      tone: 'text-destructive',
    },
    {
      key: 'saldo',
      visible: true,
      title: view === 'PREVISTO' ? 'Saldo previsto' : 'Saldo realizado',
      value: formatarMoeda(view === 'PREVISTO' ? data?.resumo.saldoPrevisto ?? 0 : data?.resumo.saldoRealizado ?? 0),
      detail:
        view === 'AMBOS'
          ? `Saldo previsto: ${formatarMoeda(data?.resumo.saldoPrevisto ?? 0)}`
          : 'Leitura consolidada do periodo',
      icon: TrendingUp,
      tone: 'text-primary',
    },
  ].filter((card) => card.visible)

  const totalDias = getDiffInDays(fromInput, toInput)

  return (
    <div className="space-y-3 overflow-x-hidden">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/12 via-background to-secondary/10 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h1 className="text-xl font-bold">Fluxo de caixa</h1></div>
            <p className="mt-1 text-xs text-muted-foreground">Previsto e realizado, com leitura diaria.</p>
          </div>
          <div className="rounded-xl border bg-background/80 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Periodo ativo · {totalDias} dia(s)</p>
            <p className="text-xs font-semibold">{formatDateInSaoPaulo(from)} a {formatDateInSaoPaulo(to)}</p>
          </div>
        </div>
      </section>

      <details className="group rounded-2xl border border-border/70 bg-card/95">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" />Filtros e periodo</span>
          <span className="text-xs font-normal text-muted-foreground">{view === 'AMBOS' ? 'Previsto + realizado' : view === 'PREVISTO' ? 'Previsto' : 'Realizado'}</span>
        </summary>
        <div className="space-y-3 border-t border-border/60 p-4">
          <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label>Visualizacao</Label>
              <Select value={viewInput} onValueChange={(value) => setViewInput(value as VisualizacaoFluxo)}>
                <SelectTrigger className="h-9 rounded-xl bg-background/80">
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
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl px-3 text-xs" onClick={() => aplicarPeriodoRapido('SEMANA')}>
                    Esta semana
                  </Button>
                  <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl px-3 text-xs" onClick={() => aplicarPeriodoRapido('MES')}>
                    Este mes
                  </Button>
                  <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl px-3 text-xs" onClick={() => aplicarPeriodoRapido('TRIMESTRE')}>
                    Trimestre
                  </Button>
                  <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl px-3 text-xs" onClick={() => aplicarPeriodoRapido('SEMESTRE')}>
                    Semestre
                  </Button>
                  <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl px-3 text-xs" onClick={() => aplicarPeriodoRapido('ANO')}>
                    Este ano
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data inicio</Label>
                  <Input
                    type="date"
                    value={fromInput}
                    onChange={(event) => setFromInput(event.target.value)}
                    className="h-9 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input
                    type="date"
                    value={toInput}
                    onChange={(event) => setToInput(event.target.value)}
                    className="h-9 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/8 px-3 py-2 text-xs text-muted-foreground">
                <CalendarRange className="h-4 w-4 text-primary" />
                Periodo selecionado: {formatDateInSaoPaulo(fromInput)} ate {formatDateInSaoPaulo(toInput)}
                <span className="ml-auto text-xs">({totalDias} dia(s))</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="h-9 rounded-xl" onClick={aplicarPeriodo} disabled={!periodoPendente}>
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </Button>
                <Button className="h-9 rounded-xl" variant="outline" onClick={resetarOuAtualizar}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {periodoPendente ? 'Limpar filtros' : 'Atualizar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </details>

      {isLoading ? (
        <div className="flex gap-2 overflow-x-auto">
          <Skeleton className="h-20 min-w-48 flex-1" />
          <Skeleton className="h-20 min-w-48 flex-1" />
          <Skeleton className="h-20 min-w-48 flex-1" />
        </div>
      ) : (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
          {cardsResumo.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.key} className="min-w-[12.5rem] flex-1 snap-start border-border/70 bg-card/95">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${card.tone}`} /><p className="text-xs text-muted-foreground">{card.title}</p></div>
                  <p className="mt-1 text-xl font-bold">{card.value}</p>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">{card.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <details className="group rounded-2xl border border-border/70 bg-card/95">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Evolucao do caixa</summary>
        <div className="border-t border-border/60 p-3">
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <ChartContainer
              className="h-[220px] w-full"
              config={{
                saldoPrevisto: { label: 'Saldo previsto', color: '#40631A' },
                saldoRealizado: { label: 'Saldo realizado', color: '#C56813' },
              }}
            >
              <AreaChart data={data?.dias ?? []} margin={{ left: 12, right: 12, top: 12, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="data" tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(5)} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatarMoeda(Number(value)).replace('R$', 'R$ ')} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatarMoeda(Number(value))} />} />
                {view !== 'REALIZADO' ? (
                  <Area type="monotone" dataKey="saldoPrevisto" stroke="#40631A" fill="#40631A" fillOpacity={0.18} />
                ) : null}
                {view !== 'PREVISTO' ? (
                  <Area type="monotone" dataKey="saldoRealizado" stroke="#C56813" fill="#C56813" fillOpacity={0.18} />
                ) : null}
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </details>

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Movimento por dia</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 md:p-4 md:pt-1">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : data?.dias.length ? (
            <>
              <div className="grid gap-1.5 lg:hidden">
                {data.dias.map((dia) => (
                  <details key={dia.data} className="group rounded-xl border border-border/70 bg-background/80">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                      <div><p className="text-sm font-semibold">{formatDateInSaoPaulo(dia.data)}</p><p className="text-[10px] text-muted-foreground">Toque para ver entradas, saidas e taxas</p></div>
                      <div className="text-right"><p className="text-[10px] text-muted-foreground">Saldo {view === 'PREVISTO' ? 'previsto' : 'realizado'}</p><p className="text-sm font-bold text-primary">{formatarMoeda(view === 'PREVISTO' ? dia.saldoPrevisto : dia.saldoRealizado)}</p></div>
                    </summary>

                    <div className="grid gap-2 border-t border-border/60 p-2.5 sm:grid-cols-2">
                      {view !== 'REALIZADO' ? (
                        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">Previsto</p>
                          <div className="mt-2 space-y-1 text-sm">
                            <p className="flex items-center justify-between gap-3">
                              <span>Entradas</span>
                              <span className="font-medium">{formatarMoeda(dia.entradasPrevistas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span>Saidas</span>
                              <span>{formatarMoeda(dia.saidasPrevistas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span>Taxas</span>
                              <span>{formatarMoeda(dia.taxasPrevistas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3 font-semibold text-primary">
                              <span>Saldo</span>
                              <span>{formatarMoeda(dia.saldoPrevisto)}</span>
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {view !== 'PREVISTO' ? (
                        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">Realizado</p>
                          <div className="mt-2 space-y-1 text-sm">
                            <p className="flex items-center justify-between gap-3">
                              <span>Entradas</span>
                              <span className="font-medium">{formatarMoeda(dia.entradasRealizadas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span>Saidas</span>
                              <span>{formatarMoeda(dia.saidasRealizadas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span>Taxas</span>
                              <span>{formatarMoeda(dia.taxasRealizadas)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3 font-semibold text-secondary-foreground">
                              <span>Saldo</span>
                              <span>{formatarMoeda(dia.saldoRealizado)}</span>
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border lg:block">
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
                        {view !== 'PREVISTO' ? <td className="py-3 pr-4 font-semibold text-secondary-foreground">{formatarMoeda(dia.saldoRealizado)}</td> : null}
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
                      {view !== 'PREVISTO' ? <td className="py-3 pr-4 text-secondary-foreground">{formatarMoeda(data.resumo.saldoRealizado)}</td> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum movimento financeiro encontrado para o periodo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
