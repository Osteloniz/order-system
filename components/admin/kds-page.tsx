'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChefHat,
  CreditCard,
  Eye,
  Loader2,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TimerReset,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { entregaLabels, getPagamentoLabel, statusPagamentoColors, statusPagamentoLabelsLong } from '@/lib/order-display'
import { canUseReadyToDeliverStatus, getNextOperationalStatus, getPreviousOperationalStatus, shouldUsePreparacaoStage } from '@/lib/order-status'
import { buildWhatsappUrl } from '@/lib/phone'
import { formatDateInSaoPaulo, formatDateTimeInSaoPaulo, getDateKeyInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'
import type { Pedido, StatusPedido } from '@/lib/types'
import { cn } from '@/lib/utils'

type KdsResponse = {
  referenceDate: string
  windowDays: number
  orders: Pedido[]
}

type FeedbackState =
  | { tone: 'success'; text: string }
  | { tone: 'error'; text: string }
  | null

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const laneConfig: Array<{
  status: Extract<StatusPedido, 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'PRONTO_ENTREGA'>
  title: string
  description: string
  icon: typeof ShoppingBag
  empty: string
  tone: string
}> = [
  {
    status: 'FEITO',
    title: 'Aguardando aceite',
    description: 'Pedidos que acabaram de entrar e precisam de conferencia.',
    icon: ShoppingBag,
    empty: 'Nenhum pedido novo para aceitar agora.',
    tone: 'border-warning/35 bg-warning/8',
  },
  {
    status: 'ACEITO',
    title: 'Separando agora',
    description: 'Pedidos conferidos e em fluxo operacional imediato.',
    icon: TimerReset,
    empty: 'Nenhum pedido aguardando separacao agora.',
    tone: 'border-accent/35 bg-accent/8',
  },
  {
    status: 'PREPARACAO',
    title: 'Em preparo',
    description: 'Etapa principal de producao das encomendas ja confirmadas.',
    icon: ChefHat,
    empty: 'Nenhuma encomenda em preparo neste momento.',
    tone: 'border-primary/35 bg-primary/8',
  },
  {
    status: 'PRONTO_ENTREGA',
    title: 'Prontos para sair',
    description: 'Pedidos liberados para entrega, retirada ou etapa final.',
    icon: PackageCheck,
    empty: 'Nada pronto para entregar ou retirar agora.',
    tone: 'border-success/35 bg-success/8',
  },
]

const horizonOptions = [
  { value: 0, label: 'So hoje' },
  { value: 1, label: 'Hoje +1 dia' },
  { value: 3, label: 'Hoje +3 dias' },
]

function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = new Date(`${dateKey}T12:00:00-03:00`)
  parsed.setDate(parsed.getDate() + days)
  return getDateKeyInSaoPaulo(parsed)
}

function getPedidoOperationalDate(pedido: Pedido) {
  return pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? pedido.encomendaPara : pedido.criadoEm
}

function isFutureEncomenda(pedido: Pedido, referenceDate: string) {
  if (pedido.tipoEntrega !== 'ENCOMENDA' || !pedido.encomendaPara) return false
  return getDateKeyInSaoPaulo(new Date(pedido.encomendaPara)) > referenceDate
}

function isOverdueEncomenda(pedido: Pedido, referenceDate: string) {
  if (pedido.tipoEntrega !== 'ENCOMENDA' || !pedido.encomendaPara) return false
  return getDateKeyInSaoPaulo(new Date(pedido.encomendaPara)) < referenceDate
}

function formatElapsedLabel(value?: string | null) {
  if (!value) return '-'
  const diffMs = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'agora'
  const totalMinutes = Math.floor(diffMs / 60000)
  if (totalMinutes < 1) return 'agora'
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function getPedidoWhatsapp(pedido: Pedido) {
  return (pedido.clienteWhatsapp || pedido.clienteTelefone || '').replace(/\D/g, '')
}

function sortOperationalOrders(a: Pedido, b: Pedido) {
  const aTime = new Date(getPedidoOperationalDate(a)).getTime()
  const bTime = new Date(getPedidoOperationalDate(b)).getTime()
  if (aTime !== bTime) return aTime - bTime
  return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
}

function getNextActionLabel(pedido: Pedido, nextStatus: StatusPedido | null) {
  if (!nextStatus) return null
  if (pedido.status === 'FEITO') return 'Aceitar'
  if (pedido.status === 'ACEITO' && nextStatus === 'PREPARACAO') return 'Iniciar preparo'
  if (pedido.status === 'ACEITO' && nextStatus === 'PRONTO_ENTREGA') return 'Marcar pronto'
  if (pedido.status === 'ACEITO' && nextStatus === 'ENTREGUE') return 'Marcar entregue'
  if (pedido.status === 'PREPARACAO' && nextStatus === 'PRONTO_ENTREGA') return 'Marcar pronto'
  if (pedido.status === 'PREPARACAO' && nextStatus === 'ENTREGUE') return 'Entregar'
  if (pedido.status === 'PRONTO_ENTREGA') return 'Entregar'
  return 'Avancar'
}

function getKdsSupportText(pedido: Pedido) {
  if (pedido.status === 'FEITO') {
    return pedido.statusPagamento === 'PENDENTE' && pedido.pagamento !== 'DINHEIRO'
      ? 'Confira o pedido e acompanhe o pagamento para liberar o proximo passo.'
      : 'Pedido novo aguardando a conferencia inicial da loja.'
  }
  if (pedido.status === 'ACEITO') {
    return shouldUsePreparacaoStage(pedido)
      ? 'Encomenda conferida. Assim que entrar em producao, mova para preparo.'
      : 'Pedido comum conferido. Siga com separacao e finalize quando estiver liberado.'
  }
  if (pedido.status === 'PREPARACAO') {
    return canUseReadyToDeliverStatus(pedido.statusPagamento)
      ? 'Producao em andamento com pagamento aprovado.'
      : 'Producao em andamento. Quando concluir, a proxima etapa segue a regra do pagamento.'
  }
  return 'Pedido pronto para entrega, retirada ou fechamento operacional.'
}

function getPendingPaymentLabel(pedido: Pedido) {
  if (pedido.pagamento === 'PIX') return 'Pagamento PIX pendente'
  if (pedido.pagamento === 'CARTAO') return 'Pagamento online pendente'
  return 'Pagamento pendente'
}

function getPedidoBadges(pedido: Pedido, referenceDate: string) {
  const badges: Array<{ label: string; className?: string }> = []

  badges.push({
    label: entregaLabels[pedido.tipoEntrega],
    className: 'border-border/70 bg-background/75 text-foreground',
  })

  if (pedido.pagamento === 'DINHEIRO') {
    badges.push({
      label: 'Dinheiro',
      className: 'border-amber-500/35 bg-amber-500/15 text-amber-100',
    })
  }

  if (pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara) {
    badges.push({
      label: isFutureEncomenda(pedido, referenceDate)
        ? `Agenda ${formatDateInSaoPaulo(pedido.encomendaPara)}`
        : isOverdueEncomenda(pedido, referenceDate)
          ? 'Encomenda atrasada'
          : 'Produzir hoje',
      className: isOverdueEncomenda(pedido, referenceDate)
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-secondary/35 bg-secondary/12 text-secondary-foreground',
    })
  }

  return badges
}

function getPaymentActionMessage(pedido: Pedido) {
  return shouldUsePreparacaoStage(pedido)
    ? 'Confirmar pagamento e liberar a encomenda para producao.'
    : 'Confirmar pagamento e sincronizar a etapa operacional.'
}

export function KdsPage() {
  const [referenceDate, setReferenceDate] = useState(todayInSaoPaulo())
  const [windowDays, setWindowDays] = useState(1)
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const url = `/api/admin/kds?date=${referenceDate}&windowDays=${windowDays}`
  const { data, isLoading, mutate } = useSWR<KdsResponse>(url, fetcher, { refreshInterval: 10000 })

  const pedidos = useMemo(() => data?.orders ?? [], [data?.orders])
  const agendaLimite = addDaysToDateKey(referenceDate, windowDays)

  const agendaEncomendas = useMemo(
    () =>
      pedidos
        .filter((pedido) => isFutureEncomenda(pedido, referenceDate))
        .sort(sortOperationalOrders),
    [pedidos, referenceDate],
  )

  const pendingPayments = useMemo(
    () =>
      pedidos
        .filter((pedido) => pedido.pagamento !== 'DINHEIRO' && pedido.statusPagamento === 'PENDENTE')
        .sort(sortOperationalOrders),
    [pedidos],
  )

  const lanes = useMemo(() => {
    const visibleNow = pedidos.filter((pedido) => !isFutureEncomenda(pedido, referenceDate))
    return laneConfig.map((lane) => ({
      ...lane,
      pedidos: visibleNow.filter((pedido) => pedido.status === lane.status).sort(sortOperationalOrders),
    }))
  }, [pedidos, referenceDate])

  const resumo = {
    aceite: lanes.find((lane) => lane.status === 'FEITO')?.pedidos.length ?? 0,
    separando: lanes.find((lane) => lane.status === 'ACEITO')?.pedidos.length ?? 0,
    preparo: lanes.find((lane) => lane.status === 'PREPARACAO')?.pedidos.length ?? 0,
    prontos: lanes.find((lane) => lane.status === 'PRONTO_ENTREGA')?.pedidos.length ?? 0,
    agenda: agendaEncomendas.length,
    pagamentos: pendingPayments.length,
  }

  const setBusy = (value: string | null) => setBusyKey(value)

  const patchPedidoStatus = async (pedidoId: string, status: StatusPedido) => {
    const response = await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      data,
      error: data?.error || 'Nao foi possivel atualizar o status.',
    }
  }

  const patchPedidoPagamento = async (pedidoId: string, statusPagamento: Pedido['statusPagamento']) => {
    const response = await fetch(`/api/admin/pedidos/${pedidoId}/pagamento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusPagamento }),
    })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      data,
      error: data?.error || 'Nao foi possivel confirmar o pagamento.',
    }
  }

  const refreshData = async () => {
    setFeedback(null)
    await mutate()
  }

  const handleAdvanceStatus = async (pedido: Pedido) => {
    const nextStatus = getNextOperationalStatus(pedido)
    if (!nextStatus) return

    const key = `advance:${pedido.id}`
    setBusy(key)
    setFeedback(null)

    try {
      const result = await patchPedidoStatus(pedido.id, nextStatus)
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error })
        return
      }

      if (selectedPedido?.id === pedido.id) {
        setSelectedPedido(result.data as Pedido)
      }

      setFeedback({ tone: 'success', text: `Pedido #${pedido.id.slice(-8).toUpperCase()} movido para ${nextStatus}.` })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const handleReturnStatus = async (pedido: Pedido) => {
    const previousStatus = getPreviousOperationalStatus(pedido)
    if (!previousStatus) return

    const key = `back:${pedido.id}`
    setBusy(key)
    setFeedback(null)

    try {
      const result = await patchPedidoStatus(pedido.id, previousStatus)
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error })
        return
      }

      if (selectedPedido?.id === pedido.id) {
        setSelectedPedido(result.data as Pedido)
      }

      setFeedback({ tone: 'success', text: `Pedido #${pedido.id.slice(-8).toUpperCase()} retornou para ${previousStatus}.` })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const handleConfirmPayment = async (pedido: Pedido) => {
    const key = `payment:${pedido.id}`
    setBusy(key)
    setFeedback(null)

    try {
      const result = await patchPedidoPagamento(pedido.id, 'APROVADO')
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error })
        return
      }

      if (selectedPedido?.id === pedido.id) {
        setSelectedPedido(result.data as Pedido)
      }

      setFeedback({ tone: 'success', text: `Pagamento do pedido #${pedido.id.slice(-8).toUpperCase()} confirmado.` })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const renderPedidoCard = (pedido: Pedido) => {
    const nextStatus = getNextOperationalStatus(pedido)
    const previousStatus = getPreviousOperationalStatus(pedido)
    const whatsappNumber = getPedidoWhatsapp(pedido)
    const whatsappUrl = whatsappNumber
      ? buildWhatsappUrl(
          whatsappNumber,
          `Oi! Estou acompanhando o pedido #${pedido.id.slice(-8).toUpperCase()} na operacao agora.`
        )
      : null

    return (
      <Card
        key={pedido.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedPedido(pedido)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setSelectedPedido(pedido)
          }
        }}
        className="cursor-pointer border-border/70 bg-card/95 transition-colors hover:border-primary/35"
      >
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p>
              <h3 className="text-lg font-bold leading-tight">{pedido.clienteNome}</h3>
              <p className="text-xs text-muted-foreground">{getKdsSupportText(pedido)}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-primary">{formatarMoeda(pedido.total)}</p>
              <p className="text-xs text-muted-foreground">ha {formatElapsedLabel(pedido.criadoEm)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {getPedidoBadges(pedido, referenceDate).map((badge) => (
              <Badge key={`${pedido.id}-${badge.label}`} variant="outline" className={badge.className}>
                {badge.label}
              </Badge>
            ))}
            <Badge className={statusPagamentoColors[pedido.statusPagamento]}>
              {statusPagamentoLabelsLong[pedido.statusPagamento]}
            </Badge>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? 'Agendado para' : 'Criado em'}
              </span>
              <span className="font-medium">
                {formatDateTimeInSaoPaulo(pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? pedido.encomendaPara : pedido.criadoEm)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="font-medium">{getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</span>
            </div>
          </div>

          <div className="space-y-2">
            {pedido.itens.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  {item.quantidade}x {item.nomeProdutoSnapshot}
                </span>
                <span className="shrink-0 font-medium">{formatarMoeda(item.totalItem)}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {pedido.pagamento !== 'DINHEIRO' && pedido.statusPagamento !== 'APROVADO' ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl"
                disabled={busyKey === `payment:${pedido.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleConfirmPayment(pedido)
                }}
              >
                {busyKey === `payment:${pedido.id}` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Confirmar pagamento
              </Button>
            ) : null}

            {nextStatus ? (
              <Button
                type="button"
                className="h-11 rounded-2xl"
                disabled={busyKey === `advance:${pedido.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleAdvanceStatus(pedido)
                }}
              >
                {busyKey === `advance:${pedido.id}` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {getNextActionLabel(pedido, nextStatus)}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-2xl"
              onClick={(event) => {
                event.stopPropagation()
                setSelectedPedido(pedido)
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              Ver pedido
            </Button>

            {whatsappUrl ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl"
                onClick={(event) => {
                  event.stopPropagation()
                  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
                }}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            ) : null}

            {previousStatus ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-muted-foreground"
                disabled={busyKey === `back:${pedido.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleReturnStatus(pedido)
                }}
              >
                {busyKey === `back:${pedido.id}` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TimerReset className="mr-2 h-4 w-4" />
                )}
                Voltar etapa
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-border/70 bg-gradient-to-br from-primary/18 via-card to-secondary/10">
        <div className="flex flex-col gap-6 px-5 py-5 md:px-7 md:py-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ChefHat className="h-3.5 w-3.5" />
              KDS operacional
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Execucao de pedidos</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Painel rapido para producao, separacao e fechamento. Ele reaproveita as regras do kanban, mas com leitura mais direta para celular e tablet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-primary/25 bg-background/60">
                Referencia {formatDateInSaoPaulo(referenceDate)}
              </Badge>
              <Badge variant="outline" className="rounded-full border-border/70 bg-background/60">
                Agenda ate {formatDateInSaoPaulo(agendaLimite)}
              </Badge>
              <Badge variant="outline" className="rounded-full border-border/70 bg-background/60">
                {pedidos.length} pedidos abertos no radar
              </Badge>
            </div>
          </div>

          <Card className="w-full border-border/70 bg-background/70 xl:max-w-xl">
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kds-reference-date">Dia de referencia</Label>
                  <Input
                    id="kds-reference-date"
                    type="date"
                    value={referenceDate}
                    onChange={(event) => setReferenceDate(event.target.value)}
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alcance da agenda</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {horizonOptions.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={windowDays === option.value ? 'default' : 'outline'}
                        className="h-11 rounded-2xl px-2 text-xs"
                        onClick={() => setWindowDays(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => void refreshData()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar painel
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: 'Aceite agora', value: resumo.aceite, tone: 'border-warning/35 bg-warning/8' },
          { label: 'Separando', value: resumo.separando, tone: 'border-accent/35 bg-accent/8' },
          { label: 'Em preparo', value: resumo.preparo, tone: 'border-primary/35 bg-primary/8' },
          { label: 'Prontos', value: resumo.prontos, tone: 'border-success/35 bg-success/8' },
          { label: 'Pagto. pendente', value: resumo.pagamentos, tone: 'border-warning/35 bg-warning/8' },
          { label: 'Agenda', value: resumo.agenda, tone: 'border-secondary/35 bg-secondary/8' },
        ].map((item) => (
          <Card key={item.label} className={cn('border-border/70 bg-card/95', item.tone)}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-3xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {feedback ? (
        <Card
          className={cn(
            'border-border/70',
            feedback.tone === 'success'
              ? 'border-success/35 bg-success/10 text-success-foreground'
              : 'border-destructive/35 bg-destructive/10 text-destructive'
          )}
        >
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            {feedback.tone === 'success' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>{feedback.text}</p>
          </CardContent>
        </Card>
      ) : null}

      {pendingPayments.length ? (
        <Card className="border-warning/35 bg-warning/8">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-5 w-5 text-warning-foreground" />
              Pagamentos pendentes no radar
            </CardTitle>
            <CardDescription>
              Esses pedidos ainda dependem de confirmacao financeira para destravar a proxima etapa com seguranca.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {pendingPayments.slice(0, 6).map((pedido) => (
              <div key={`payment-${pedido.id}`} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">#{pedido.id.slice(-8).toUpperCase()} - {pedido.clienteNome}</p>
                    <p className="text-sm text-muted-foreground">{getPendingPaymentLabel(pedido)}</p>
                  </div>
                  <Badge className={statusPagamentoColors[pedido.statusPagamento]}>
                    {statusPagamentoLabelsLong[pedido.statusPagamento]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</span>
                  <span>•</span>
                  <span>{pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? formatDateTimeInSaoPaulo(pedido.encomendaPara) : formatDateTimeInSaoPaulo(pedido.criadoEm)}</span>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="h-10 rounded-2xl"
                    disabled={busyKey === `payment:${pedido.id}`}
                    onClick={() => void handleConfirmPayment(pedido)}
                  >
                    {busyKey === `payment:${pedido.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Confirmar pagamento
                  </Button>
                  <Button type="button" variant="ghost" className="h-10 rounded-2xl" onClick={() => setSelectedPedido(pedido)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Ver pedido
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" />
            Agenda de encomendas
          </CardTitle>
          <CardDescription>
            Encomendas futuras continuam visiveis aqui para o time se organizar sem poluir a fila principal de agora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-40 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
          ) : agendaEncomendas.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agendaEncomendas.map((pedido) => (
                <Card key={`agenda-${pedido.id}`} className="border-border/70 bg-background/70">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p>
                        <p className="text-lg font-bold leading-tight">{pedido.clienteNome}</p>
                      </div>
                      <Badge variant="outline" className="border-secondary/35 bg-secondary/12 text-secondary-foreground">
                        {pedido.encomendaPara ? formatDateInSaoPaulo(pedido.encomendaPara) : '-'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Horario previsto:{' '}
                      <strong className="text-foreground">
                        {pedido.encomendaPara ? formatDateTimeInSaoPaulo(pedido.encomendaPara) : '-'}
                      </strong>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {pedido.itens.map((item) => `${item.quantidade}x ${item.nomeProdutoSnapshot}`).join(', ')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={statusPagamentoColors[pedido.statusPagamento]}>
                        {statusPagamentoLabelsLong[pedido.statusPagamento]}
                      </Badge>
                      <Badge variant="outline">{pedido.status}</Badge>
                    </div>
                    <Button type="button" variant="ghost" className="h-10 rounded-2xl" onClick={() => setSelectedPedido(pedido)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Abrir detalhe
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/70 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma encomenda futura aberta ate {formatDateInSaoPaulo(agendaLimite)}.
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-4">
          <Skeleton className="h-[360px] rounded-[28px]" />
          <Skeleton className="h-[360px] rounded-[28px]" />
          <Skeleton className="h-[360px] rounded-[28px]" />
          <Skeleton className="h-[360px] rounded-[28px]" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          {lanes.map((lane) => {
            const Icon = lane.icon
            return (
              <Card key={lane.status} className={cn('border-border/70 bg-card/95', lane.tone)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/80 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <CardTitle className="text-lg">{lane.title}</CardTitle>
                        <CardDescription className="mt-1">{lane.description}</CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary">{lane.pedidos.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {lane.pedidos.length ? (
                    <div className="space-y-3">
                      {lane.pedidos.map(renderPedidoCard)}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border/70 bg-background/45 px-4 py-10 text-center text-sm text-muted-foreground">
                      {lane.empty}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={!!selectedPedido} onOpenChange={() => setSelectedPedido(null)}>
        <SheetContent className="w-full overflow-y-auto px-4 sm:max-w-lg">
          {selectedPedido ? (
            <div className="space-y-5 pb-6">
              <SheetHeader className="space-y-3 text-left">
                <div className="flex flex-wrap gap-2">
                  {getPedidoBadges(selectedPedido, referenceDate).map((badge) => (
                    <Badge key={`sheet-${selectedPedido.id}-${badge.label}`} variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  ))}
                  <Badge className={statusPagamentoColors[selectedPedido.statusPagamento]}>
                    {statusPagamentoLabelsLong[selectedPedido.statusPagamento]}
                  </Badge>
                </div>
                <SheetTitle className="text-2xl font-bold">
                  #{selectedPedido.id.slice(-8).toUpperCase()} - {selectedPedido.clienteNome}
                </SheetTitle>
              </SheetHeader>

              <Card className="border-border/70 bg-card/90">
                <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fluxo</p>
                    <p className="mt-1 font-semibold">{selectedPedido.status}</p>
                    <p className="text-sm text-muted-foreground">{getKdsSupportText(selectedPedido)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pagamento</p>
                    <p className="mt-1 font-semibold">{getPagamentoLabel(selectedPedido.pagamento, selectedPedido.tipoCartao)}</p>
                    <p className="text-sm text-muted-foreground">{getPaymentActionMessage(selectedPedido)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Dados operacionais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Contato</span>
                    <span className="font-medium">
                      {selectedPedido.clienteWhatsapp || selectedPedido.clienteTelefone
                        ? formatarTelefone(selectedPedido.clienteWhatsapp || selectedPedido.clienteTelefone)
                        : 'Nao informado'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Entrega</span>
                    <span className="font-medium">{entregaLabels[selectedPedido.tipoEntrega]}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {selectedPedido.tipoEntrega === 'ENCOMENDA' && selectedPedido.encomendaPara ? 'Agendado para' : 'Criado em'}
                    </span>
                    <span className="font-medium">
                      {formatDateTimeInSaoPaulo(selectedPedido.tipoEntrega === 'ENCOMENDA' && selectedPedido.encomendaPara ? selectedPedido.encomendaPara : selectedPedido.criadoEm)}
                    </span>
                  </div>
                  {selectedPedido.tipoEntrega === 'RESERVA_PAULISTANO' ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Destino</span>
                      <span className="font-medium">
                        Bloco {selectedPedido.clienteBloco || '-'} • Apto {selectedPedido.clienteApartamento || '-'}
                      </span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Itens do pedido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedPedido.itens.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words">
                        {item.quantidade}x {item.nomeProdutoSnapshot}
                      </span>
                      <span className="shrink-0 font-medium">{formatarMoeda(item.totalItem)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-primary">{formatarMoeda(selectedPedido.total)}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-2">
                {selectedPedido.pagamento !== 'DINHEIRO' && selectedPedido.statusPagamento !== 'APROVADO' ? (
                  <Button
                    type="button"
                    className="h-12 rounded-2xl"
                    disabled={busyKey === `payment:${selectedPedido.id}`}
                    onClick={() => void handleConfirmPayment(selectedPedido)}
                  >
                    {busyKey === `payment:${selectedPedido.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Confirmar pagamento
                  </Button>
                ) : null}

                {getNextOperationalStatus(selectedPedido) ? (
                  <Button
                    type="button"
                    className="h-12 rounded-2xl"
                    disabled={busyKey === `advance:${selectedPedido.id}`}
                    onClick={() => void handleAdvanceStatus(selectedPedido)}
                  >
                    {busyKey === `advance:${selectedPedido.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {getNextActionLabel(selectedPedido, getNextOperationalStatus(selectedPedido))}
                  </Button>
                ) : null}

                {getPreviousOperationalStatus(selectedPedido) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-2xl"
                    disabled={busyKey === `back:${selectedPedido.id}`}
                    onClick={() => void handleReturnStatus(selectedPedido)}
                  >
                    {busyKey === `back:${selectedPedido.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TimerReset className="mr-2 h-4 w-4" />
                    )}
                    Voltar uma etapa
                  </Button>
                ) : null}

                {getPedidoWhatsapp(selectedPedido) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-12 rounded-2xl"
                    onClick={() => {
                      const url = buildWhatsappUrl(
                        getPedidoWhatsapp(selectedPedido),
                        `Oi! Estou acompanhando o pedido #${selectedPedido.id.slice(-8).toUpperCase()} por aqui.`
                      )
                      if (url) {
                        window.open(url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Abrir WhatsApp
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
