'use client'

import type { DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Archive, Bell, BellRing, Check, ChefHat, ChevronDown, Clock, CreditCard, GripVertical, LayoutGrid, List, MessageCircle, Package, Pencil, Phone, Plus, RefreshCw, Search, ShoppingBag, SlidersHorizontal, Trash2, Truck, User, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NovoPedidoAdminPage } from '@/components/admin/novo-pedido-page'
import { formatarMoeda, formatarHora, formatarTelefone } from '@/lib/calc'
import { getAdminAlertSoundEnabled, getAdminAlertsEnabled, getNotificationPermission, setAdminAlertsEnabled } from '@/lib/admin-alert-settings'
import { getHostedGatewayLabel, inferHostedCheckoutGateway } from '@/lib/hosted-payment'
import { buildPaymentReminderMessage, buildStatusMessage, hydrateConfigWithMessageDefaults } from '@/lib/message-templates'
import { entregaLabels, getPagamentoLabel, statusPagamentoLabels } from '@/lib/order-display'
import { getNextOperationalStatus, getPreviousOperationalStatus, shouldUsePreparacaoStage } from '@/lib/order-status'
import { buildWhatsappUrl } from '@/lib/phone'
import { formatDateTimeInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'
import type { Configuracao, Pedido, StatusPedido, TipoCartao, TipoPagamento } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const statusConfig: Record<StatusPedido, { label: string; color: string; columnClass: string; icon: typeof Clock }> = {
  FEITO: { label: 'Novo', color: 'bg-warning text-warning-foreground', columnClass: 'border-warning/40 bg-warning/5', icon: Clock },
  ACEITO: { label: 'Aceito', color: 'bg-accent text-accent-foreground', columnClass: 'border-accent/40 bg-accent/5', icon: Check },
  PREPARACAO: { label: 'Preparando', color: 'bg-primary text-primary-foreground', columnClass: 'border-primary/40 bg-primary/5', icon: ChefHat },
  PRONTO_ENTREGA: { label: 'Pronto para entregar', color: 'bg-success/15 text-success dark:bg-success/20 dark:text-white', columnClass: 'border-success/40 bg-success/5', icon: Package },
  ENTREGUE: { label: 'Entregue', color: 'bg-success text-success-foreground', columnClass: 'border-success/40 bg-success/5', icon: Truck },
  CANCELADO: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground', columnClass: 'border-destructive/40 bg-destructive/5', icon: X }
}

const kanbanColumns: { status: StatusPedido; title: string; hint: string }[] = [
  { status: 'FEITO', title: 'Novos', hint: 'Entraram agora no painel' },
  { status: 'ACEITO', title: 'Aceitos', hint: 'Pedido conferido pela loja' },
  { status: 'PREPARACAO', title: 'Em preparo', hint: 'Etapa usada principalmente para encomendas' },
  { status: 'PRONTO_ENTREGA', title: 'Prontos', hint: 'Separados, pagos ou liberados para sair' },
  { status: 'ENTREGUE', title: 'Entregues', hint: 'Finalizados' },
  { status: 'CANCELADO', title: 'Cancelados', hint: 'Somente consulta' },
]

type EstoqueConsultaItem = {
  produtoId: string
  nomeProduto: string
  categoriaNome: string
  quantidadeDisponivel: number
  quantidadeReservada: number
  pendenteBaixaLegada: number
  saldoProjetado: number
}

type EstoqueConsultaData = {
  estoque: EstoqueConsultaItem[]
}

function getPedidoWhatsapp(pedido: Pedido) {
  return (pedido.clienteWhatsapp || pedido.clienteTelefone || '').replace(/\D/g, '')
}

function abrirWhatsappStatus(pedido: Pedido, status: StatusPedido, config?: Configuracao | null) {
  const mensagem = buildStatusMessage(pedido, status, config)
  const url = buildWhatsappUrl(getPedidoWhatsapp(pedido), mensagem)
  if (!url || !mensagem) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function canMovePedido(pedido: Pedido, targetStatus: StatusPedido) {
  if (pedido.status === targetStatus) return false
  if (targetStatus === 'PRONTO_ENTREGA') {
    if (pedido.statusPagamento !== 'APROVADO') return false
    if (shouldUsePreparacaoStage(pedido)) {
      return pedido.status === 'PREPARACAO' || pedido.status === 'ENTREGUE'
    }
    return pedido.status !== 'CANCELADO' && pedido.status !== 'PRONTO_ENTREGA'
  }
  if (targetStatus === 'PREPARACAO' && !shouldUsePreparacaoStage(pedido)) {
    return false
  }
  return true
}

function getPedidoPrimaryDateLabel(pedido: Pedido) {
  if (pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara) {
    return `Encomenda para ${formatDateTimeInSaoPaulo(pedido.encomendaPara)}`
  }
  if (pedido.levadoEm) {
    return `Levado em ${formatDateTimeInSaoPaulo(pedido.levadoEm)}`
  }
  return `Criado em ${formatDateTimeInSaoPaulo(pedido.criadoEm)}`
}

function getNextStatusLabel(pedido: Pedido, nextStatus: StatusPedido | null) {
  if (!nextStatus) return null
  if (pedido.status === 'FEITO') return 'Aceitar pedido'
  if (pedido.status === 'ACEITO' && nextStatus === 'PREPARACAO') return 'Iniciar preparo da encomenda'
  if (pedido.status === 'ACEITO' && nextStatus === 'PRONTO_ENTREGA') return 'Marcar pronto para entrega'
  if (pedido.status === 'ACEITO' && nextStatus === 'ENTREGUE') return 'Marcar entregue'
  if (pedido.status === 'PREPARACAO' && nextStatus === 'PRONTO_ENTREGA') return 'Marcar pronto para entregar'
  if (pedido.status === 'PREPARACAO' && nextStatus === 'ENTREGUE') return 'Marcar entregue'
  if (pedido.status === 'PRONTO_ENTREGA') return 'Marcar entregue'
  return 'Avancar etapa'
}

function getGatewayBadgeClass(gateway: ReturnType<typeof inferHostedCheckoutGateway>) {
  if (gateway === 'MERCADO_PAGO') {
    return 'border-[#559eee]/35 bg-[#559eee]/10 text-[#2468a8] dark:text-[#b9dbff]'
  }

  if (gateway === 'ASAAS') {
    return 'border-[#c56813]/35 bg-[#c56813]/10 text-[#94500d] dark:text-[#f2bd80]'
  }

  return 'border-border/70 bg-background/70 text-muted-foreground'
}

export function PedidosDashboard() {
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [deletingPedidoId, setDeletingPedidoId] = useState<string | null>(null)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)
  const [paymentActionPedidoId, setPaymentActionPedidoId] = useState<string | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState<'deliver' | 'payment' | 'advance' | 'return' | null>(null)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission)
  const [lastAlertMessage, setLastAlertMessage] = useState<string | null>(null)
  const [draggedPedidoId, setDraggedPedidoId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusPedido | 'TODOS'>('TODOS')
  const [paymentFilter, setPaymentFilter] = useState<'TODOS' | Pedido['pagamento']>('TODOS')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'TODOS' | Pedido['statusPagamento']>('TODOS')
  const [dateFilter, setDateFilter] = useState(todayInSaoPaulo)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null)
  const [paymentMethodDialogPedido, setPaymentMethodDialogPedido] = useState<Pedido | null>(null)
  const [paymentMethodValue, setPaymentMethodValue] = useState<'PIX' | 'DINHEIRO' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO'>('DINHEIRO')
  const [stockLookupOpen, setStockLookupOpen] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LISTA'>('KANBAN')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [collapsedListStatuses, setCollapsedListStatuses] = useState<Set<StatusPedido>>(
    () => new Set<StatusPedido>(['ENTREGUE', 'CANCELADO'])
  )
  const seenPedidoIdsRef = useRef<Set<string>>(new Set())
  const initialPedidosLoadedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  const pedidosUrl = `/api/admin/pedidos?date=${dateFilter}&carryoverNovos=1`
  const { data: pedidos, isLoading } = useSWR<Pedido[]>(pedidosUrl, fetcher, { refreshInterval: 5000 })
  const { data: rawConfig } = useSWR<Configuracao>('/api/admin/config', fetcher)
  const estoqueConsultaUrl = `/api/admin/producao?from=${todayInSaoPaulo()}&to=${todayInSaoPaulo()}`
  const { data: estoqueConsulta, isLoading: isLoadingEstoqueConsulta, mutate: mutateEstoqueConsulta } = useSWR<EstoqueConsultaData>(stockLookupOpen ? estoqueConsultaUrl : null, fetcher, { refreshInterval: 15000 })
  const config = hydrateConfigWithMessageDefaults(rawConfig)

  useEffect(() => {
    const savedView = window.localStorage.getItem('admin_orders_view')
    if (savedView === 'KANBAN' || savedView === 'LISTA') {
      setViewMode(savedView)
      return
    }
    if (window.matchMedia('(max-width: 767px)').matches) {
      setViewMode('LISTA')
    }
  }, [])

  const changeViewMode = (mode: 'KANBAN' | 'LISTA') => {
    setViewMode(mode)
    window.localStorage.setItem('admin_orders_view', mode)
  }

  const contadores = {
    novos: pedidos?.filter(p => p.status === 'FEITO').length || 0,
    aceitos: pedidos?.filter(p => p.status === 'ACEITO').length || 0,
    preparando: pedidos?.filter(p => p.status === 'PREPARACAO').length || 0,
    prontosEntrega: pedidos?.filter(p => p.status === 'PRONTO_ENTREGA').length || 0,
    entregues: pedidos?.filter(p => p.status === 'ENTREGUE').length || 0,
    cancelados: pedidos?.filter(p => p.status === 'CANCELADO').length || 0,
    todos: pedidos?.length || 0
  }

  const resumoCards = [
    { key: 'novos', label: 'Novos', value: contadores.novos },
    { key: 'aceitos', label: 'Aceitos', value: contadores.aceitos },
    { key: 'preparando', label: 'Em preparo', value: contadores.preparando },
    { key: 'prontos', label: 'Prontos', value: contadores.prontosEntrega },
    { key: 'entregues', label: 'Entregues', value: contadores.entregues },
    { key: 'total', label: 'Total', value: contadores.todos },
  ]

  const hostedCheckoutResumo = useMemo(() => {
    return (pedidos || []).reduce(
      (acc, pedido) => {
        if (pedido.pagamento === 'DINHEIRO') {
          acc.dinheiro += 1
          return acc
        }

        const gateway = inferHostedCheckoutGateway(pedido.asaasCheckoutUrl)
        if (gateway === 'MERCADO_PAGO') {
          acc.mercadoPago += 1
        } else if (gateway === 'ASAAS') {
          acc.asaas += 1
        } else {
          acc.manual += 1
        }

        if (pedido.statusPagamento === 'PENDENTE') {
          acc.onlinePendentes += 1
        }

        if (pedido.statusPagamento === 'APROVADO') {
          acc.onlineAprovados += 1
        }

        return acc
      },
      {
        mercadoPago: 0,
        asaas: 0,
        manual: 0,
        dinheiro: 0,
        onlinePendentes: 0,
        onlineAprovados: 0,
      },
    )
  }, [pedidos])

  const pedidosFiltrados = (pedidos || []).filter(pedido => {
    const busca = searchTerm.trim().toLowerCase()
    const textoBusca = [
      pedido.id,
      pedido.id.slice(-8),
      pedido.clienteNome,
      pedido.clienteTelefone,
      pedido.clienteWhatsapp,
      pedido.clienteBloco,
      pedido.clienteApartamento,
      pedido.responsavelPedido,
      pedido.destinatariosPedido,
      pedido.observacoesPedido,
      pedido.itens.map(item => item.nomeProdutoSnapshot).join(' '),
    ].filter(Boolean).join(' ').toLowerCase()

    if (busca && !textoBusca.includes(busca)) return false
    if (statusFilter !== 'TODOS' && pedido.status !== statusFilter) return false
    if (paymentFilter !== 'TODOS' && pedido.pagamento !== paymentFilter) return false
    if (paymentStatusFilter !== 'TODOS' && pedido.statusPagamento !== paymentStatusFilter) return false

    return true
  })

  const selectedPedidos = useMemo(() => {
    const ids = new Set(selectedPedidoIds)
    return (pedidos || []).filter((pedido) => ids.has(pedido.id))
  }, [pedidos, selectedPedidoIds])

  const selectedPedidosEntregaveis = useMemo(
    () => selectedPedidos.filter((pedido) => pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO'),
    [selectedPedidos]
  )

  const selectedPedidosPagamentoPendente = useMemo(
    () => selectedPedidos.filter((pedido) => pedido.status !== 'CANCELADO' && pedido.statusPagamento !== 'APROVADO'),
    [selectedPedidos]
  )

  const selectedPedidosAvancaveis = useMemo(
    () => selectedPedidos.filter((pedido) => !!getNextOperationalStatus(pedido)),
    [selectedPedidos]
  )

  const selectedPedidosRetornaveis = useMemo(
    () => selectedPedidos.filter((pedido) => !!getPreviousOperationalStatus(pedido)),
    [selectedPedidos]
  )

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    statusFilter !== 'TODOS' ||
    paymentFilter !== 'TODOS' ||
    paymentStatusFilter !== 'TODOS' ||
    dateFilter !== todayInSaoPaulo()
  )

  const estoqueConsultaFiltrado = useMemo(() => {
    const busca = stockSearch.trim().toLowerCase()
    const itens = estoqueConsulta?.estoque ?? []
    if (!busca) return itens
    return itens.filter((item) => `${item.nomeProduto} ${item.categoriaNome}`.toLowerCase().includes(busca))
  }, [estoqueConsulta?.estoque, stockSearch])

  const pedidosPorStatus = useMemo(() => {
    return kanbanColumns.reduce((acc, column) => {
      acc[column.status] = pedidosFiltrados.filter((pedido) => pedido.status === column.status)
      return acc
    }, {} as Record<StatusPedido, Pedido[]>)
  }, [pedidosFiltrados])

  const listColumnsWithPedidos = useMemo(
    () => kanbanColumns.filter((column) => (pedidosPorStatus[column.status]?.length ?? 0) > 0),
    [pedidosPorStatus]
  )

  const setListPhaseOpen = (status: StatusPedido, open: boolean) => {
    setCollapsedListStatuses((current) => {
      const next = new Set(current)
      if (open) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const collapseAllListPhases = () => {
    setCollapsedListStatuses(new Set(listColumnsWithPedidos.map((column) => column.status)))
  }

  const expandAllListPhases = () => setCollapsedListStatuses(new Set())

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('TODOS')
    setPaymentFilter('TODOS')
    setPaymentStatusFilter('TODOS')
    setDateFilter(todayInSaoPaulo())
  }

  const unlockAlertSound = async () => {
    if (audioContextRef.current) {
      await audioContextRef.current.resume()
      return
    }
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContextRef.current = new AudioContextConstructor()
    await audioContextRef.current.resume()
  }

  const playAlertSound = async () => {
    const audioContext = audioContextRef.current
    if (!audioContext) return
    await audioContext.resume()

    const beep = (startAt: number, frequency: number) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(frequency, startAt)
      gain.gain.setValueAtTime(0.001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.32, startAt + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.28)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.3)
    }

    beep(audioContext.currentTime, 920)
    beep(audioContext.currentTime + 0.38, 920)
    beep(audioContext.currentTime + 0.76, 720)
  }

  useEffect(() => {
    if (getAdminAlertsEnabled() && getNotificationPermission() !== 'denied') {
      setAlertsEnabled(true)
      setLastAlertMessage('Alertas ativos. Clique em "Ativar som" nesta sessao para ouvir o aviso sonoro.')
    }
    setNotificationPermission(getNotificationPermission())
  }, [])

  useEffect(() => {
    if (!pedidos) return

    if (!initialPedidosLoadedRef.current) {
      seenPedidoIdsRef.current = new Set(pedidos.map(pedido => pedido.id))
      initialPedidosLoadedRef.current = true
      return
    }

    const novosPedidos = pedidos.filter(pedido => pedido.status === 'FEITO' && !seenPedidoIdsRef.current.has(pedido.id))
    pedidos.forEach(pedido => seenPedidoIdsRef.current.add(pedido.id))

    const totalNovos = pedidos.filter(pedido => pedido.status === 'FEITO').length
    document.title = totalNovos > 0 ? `(${totalNovos}) Novos pedidos - Brookie` : 'Brookie Pregiato - Pedidos Online'

    if (novosPedidos.length === 0 || !alertsEnabled) return

    const message = totalNovos === 1 ? '1 pedido novo aguardando aceite' : `${totalNovos} pedidos novos aguardando aceite`
    setLastAlertMessage(message)
    if (soundUnlocked && getAdminAlertSoundEnabled()) {
      void playAlertSound()
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Brookie Pregiato', {
        body: message,
        icon: '/icon-192.png',
        tag: 'novo-pedido',
        requireInteraction: true
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }, [alertsEnabled, pedidos, soundUnlocked])

  useEffect(() => {
    return () => {
      document.title = 'Brookie Pregiato - Pedidos Online'
    }
  }, [])

  useEffect(() => {
    if (!pedidos) return
    const idsDisponiveis = new Set(pedidos.map((pedido) => pedido.id))
    setSelectedPedidoIds((atual) => atual.filter((id) => idsDisponiveis.has(id)))
  }, [pedidos])

  const patchPedidoStatus = async (pedidoId: string, status: StatusPedido, motivoCancelamento?: string) => {
    const response = await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(motivoCancelamento ? { status, motivoCancelamento } : { status })
    })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      data,
      error: data?.error || 'Não foi possível atualizar o status.',
    }
  }

  const patchPedidoPagamento = async (pedidoId: string, statusPagamento: Pedido['statusPagamento']) => {
    const response = await fetch(`/api/admin/pedidos/${pedidoId}/pagamento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusPagamento })
    })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      data,
      error: data?.error || 'Não foi possível atualizar o pagamento.',
    }
  }

  const postPedidoPagamentoAction = async (
    pedidoId: string,
    body: Record<string, unknown>,
  ) => {
    const response = await fetch(`/api/admin/pedidos/${pedidoId}/pagamento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      data,
      error: data?.error || 'Nao foi possivel atualizar o pagamento.',
    }
  }

  const handleEnableAlerts = async () => {
    await unlockAlertSound()
    let permission = getNotificationPermission()
    if ('Notification' in window && Notification.permission === 'default') permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setLastAlertMessage(permission === 'denied' ? 'Notificações bloqueadas no navegador. O som interno continua ativo enquanto a aba permitir áudio.' : 'Alertas ativados para novos pedidos.')
    setAlertsEnabled(true)
    setAdminAlertsEnabled(true)
    setSoundUnlocked(true)
    void playAlertSound()
  }

  const handleDisableAlerts = () => {
    setAlertsEnabled(false)
    setAdminAlertsEnabled(false)
    setLastAlertMessage('Alertas pausados.')
  }

  const handleUnlockSound = async () => {
    await unlockAlertSound()
    setSoundUnlocked(true)
    setLastAlertMessage('Som reativado para esta sessao.')
    void playAlertSound()
  }

  const handleUpdateStatus = async (pedido: Pedido, newStatus: StatusPedido) => {
    const pedidoId = pedido.id
    setUpdatingStatus(pedidoId)
    try {
      const result = await patchPedidoStatus(pedidoId, newStatus)
      if (!result.ok) {
        setLastAlertMessage(result.error)
        return
      }
      const pedidoAtualizado = result.data
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
      const configAtual = await fetch('/api/admin/config').then(res => res.ok ? res.json() : null).catch(() => null)
      if ((configAtual?.envioAutomaticoWhatsappStatus ?? config?.envioAutomaticoWhatsappStatus) === true) {
        abrirWhatsappStatus(pedido, newStatus, configAtual ?? config)
      }
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleMovePedido = async (pedido: Pedido, targetStatus: StatusPedido) => {
    if (!canMovePedido(pedido, targetStatus)) {
      setLastAlertMessage(
        targetStatus === 'PRONTO_ENTREGA'
          ? 'Pronto para entregar fica disponivel apenas para pedidos pagos e depois do preparo.'
          : `Movimento não permitido: ${statusConfig[pedido.status].label} para ${statusConfig[targetStatus].label}.`
      )
      return
    }
    await handleUpdateStatus(pedido, targetStatus)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>, targetStatus: StatusPedido) => {
    event.preventDefault()
    const pedidoId = event.dataTransfer.getData('text/plain') || draggedPedidoId
    setDraggedPedidoId(null)
    const pedido = pedidos?.find(item => item.id === pedidoId)
    if (!pedido) return
    await handleMovePedido(pedido, targetStatus)
  }

  const handleRefresh = () => mutate(pedidosUrl)

  const handleCancelPedido = async (pedidoId: string) => {
    if (!cancelReason.trim()) return
    setIsCancelling(true)
    try {
      const result = await patchPedidoStatus(pedidoId, 'CANCELADO', cancelReason)
      if (!result.ok) {
        setLastAlertMessage(result.error)
        return
      }
      const pedidoAtualizado = result.data
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
      setCancelReason('')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDeletePedido = async (pedidoId: string) => {
    setDeletingPedidoId(pedidoId)
    try {
      const response = await fetch(`/api/admin/pedidos/${pedidoId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        setLastAlertMessage(data.error || 'Nao foi possivel excluir o pedido.')
        return
      }
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (selectedPedido?.id === pedidoId) setSelectedPedido(null)
    } finally {
      setDeletingPedidoId(null)
    }
  }

  const handleConfirmPayment = async (pedidoId: string) => {
    await handleUpdatePaymentStatus(pedidoId, 'APROVADO')
  }

  const handleUpdatePaymentStatus = async (pedidoId: string, statusPagamento: Pedido['statusPagamento']) => {
    setConfirmingPaymentId(pedidoId)
    try {
      const result = await patchPedidoPagamento(pedidoId, statusPagamento)
      if (!result.ok) {
        setLastAlertMessage(result.error)
        return
      }
      const pedidoAtualizado = result.data as Pedido
      await mutate(
        pedidosUrl,
        (current?: Pedido[]) => current?.map((pedido) => pedido.id === pedidoId ? pedidoAtualizado : pedido),
        false,
      )
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
    } finally {
      setConfirmingPaymentId(null)
    }
  }

  const handleRefreshPaymentLink = async (pedido: Pedido) => {
    if (pedido.pagamento === 'DINHEIRO') {
      setLastAlertMessage('Esse pedido nao possui link de pagamento online.')
      return null
    }

    setPaymentActionPedidoId(pedido.id)
    try {
      const result = await postPedidoPagamentoAction(pedido.id, { action: 'REFRESH_LINK' })
      if (!result.ok) {
        setLastAlertMessage(result.error)
        return null
      }

      const pedidoAtualizado = result.data?.pedido as Pedido | undefined
      if (!pedidoAtualizado?.asaasCheckoutUrl) {
        setLastAlertMessage('Nao foi possivel obter um link de pagamento para esse pedido.')
        return null
      }

      await mutate(pedidosUrl)
      if (selectedPedido?.id === pedido.id) setSelectedPedido(pedidoAtualizado)
      setLastAlertMessage(result.data?.reused ? 'Link atual ainda estava valido e foi reaproveitado.' : 'Novo link de pagamento gerado com sucesso.')
      return pedidoAtualizado
    } finally {
      setPaymentActionPedidoId(null)
    }
  }

  const handleCopyPaymentLink = async (pedido: Pedido) => {
    const pedidoComLink =
      pedido.pagamento !== 'DINHEIRO' && pedido.statusPagamento === 'PENDENTE'
        ? await handleRefreshPaymentLink(pedido)
        : pedido

    const link = pedidoComLink?.asaasCheckoutUrl
    if (!link) return

    try {
      await navigator.clipboard.writeText(link)
      setLastAlertMessage('Link de pagamento copiado.')
    } catch {
      setLastAlertMessage('Nao foi possivel copiar o link agora.')
    }
  }

  const handleSwitchPaymentMethod = async () => {
    if (!paymentMethodDialogPedido) return

    const pagamento: TipoPagamento =
      paymentMethodValue === 'PIX'
        ? 'PIX'
        : paymentMethodValue === 'DINHEIRO'
          ? 'DINHEIRO'
          : 'CARTAO'
    const tipoCartao: TipoCartao | null =
      paymentMethodValue === 'CARTAO_CREDITO'
        ? 'CREDITO'
        : paymentMethodValue === 'CARTAO_DEBITO'
          ? 'DEBITO'
          : null

    setPaymentActionPedidoId(paymentMethodDialogPedido.id)
    try {
      const result = await postPedidoPagamentoAction(paymentMethodDialogPedido.id, {
        action: 'SWITCH_METHOD',
        pagamento,
        tipoCartao: tipoCartao ?? undefined,
      })

      if (!result.ok) {
        setLastAlertMessage(result.error)
        return
      }

      const pedidoAtualizado = result.data?.pedido as Pedido | undefined
      if (pedidoAtualizado) {
        await mutate(pedidosUrl)
        if (selectedPedido?.id === pedidoAtualizado.id) setSelectedPedido(pedidoAtualizado)
      }

      setPaymentMethodDialogPedido(null)
      setLastAlertMessage('Forma de pagamento atualizada com sucesso.')
    } finally {
      setPaymentActionPedidoId(null)
    }
  }

  const togglePedidoSelection = (pedidoId: string, checked: boolean) => {
    setSelectedPedidoIds((atual) => {
      if (checked) {
        if (atual.includes(pedidoId)) return atual
        return [...atual, pedidoId]
      }
      return atual.filter((id) => id !== pedidoId)
    })
  }

  const handleSelectAllFiltered = () => {
    setSelectedPedidoIds((atual) => {
      const ids = new Set(atual)
      pedidosFiltrados.forEach((pedido) => ids.add(pedido.id))
      return Array.from(ids)
    })
  }

  const handleClearSelection = () => setSelectedPedidoIds([])

  const handleBulkMarkDelivered = async () => {
    if (selectedPedidosEntregaveis.length === 0) return
    setBulkActionLoading('deliver')
    const falhas: string[] = []
    let pedidoAtualizadoSelecionado: Pedido | null = null
    try {
      for (const pedido of selectedPedidosEntregaveis) {
        const result = await patchPedidoStatus(pedido.id, 'ENTREGUE')
        if (!result.ok) {
          falhas.push(`#${pedido.id.slice(-8).toUpperCase()}: ${result.error}`)
          continue
        }
        if (selectedPedido?.id === pedido.id) pedidoAtualizadoSelecionado = result.data
      }

      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (pedidoAtualizadoSelecionado) setSelectedPedido(pedidoAtualizadoSelecionado)
      setSelectedPedidoIds([])
      setLastAlertMessage(
        falhas.length === 0
          ? `${selectedPedidosEntregaveis.length} pedido(s) marcado(s) como entregue(s).`
          : `${selectedPedidosEntregaveis.length - falhas.length} pedido(s) entregues, ${falhas.length} com erro.`
      )
    } finally {
      setBulkActionLoading(null)
    }
  }

  const handleBulkConfirmPayment = async () => {
    if (selectedPedidosPagamentoPendente.length === 0) return
    setBulkActionLoading('payment')
    const falhas: string[] = []
    let pedidoAtualizadoSelecionado: Pedido | null = null
    try {
      for (const pedido of selectedPedidosPagamentoPendente) {
        const result = await patchPedidoPagamento(pedido.id, 'APROVADO')
        if (!result.ok) {
          falhas.push(`#${pedido.id.slice(-8).toUpperCase()}: ${result.error}`)
          continue
        }
        if (selectedPedido?.id === pedido.id) pedidoAtualizadoSelecionado = result.data
      }

      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (pedidoAtualizadoSelecionado) setSelectedPedido(pedidoAtualizadoSelecionado)
      setSelectedPedidoIds([])
      setLastAlertMessage(
        falhas.length === 0
          ? `${selectedPedidosPagamentoPendente.length} pagamento(s) confirmado(s) manualmente.`
          : `${selectedPedidosPagamentoPendente.length - falhas.length} pagamento(s) confirmados, ${falhas.length} com erro.`
      )
    } finally {
      setBulkActionLoading(null)
    }
  }

  const handleBulkAdvanceStatus = async () => {
    if (selectedPedidosAvancaveis.length === 0) return
    setBulkActionLoading('advance')
    const falhas: string[] = []
    let pedidoAtualizadoSelecionado: Pedido | null = null
    try {
      for (const pedido of selectedPedidosAvancaveis) {
        const nextStatus = getNextOperationalStatus(pedido)
        if (!nextStatus) continue
        const result = await patchPedidoStatus(pedido.id, nextStatus)
        if (!result.ok) {
          falhas.push(`#${pedido.id.slice(-8).toUpperCase()}: ${result.error}`)
          continue
        }
        if (selectedPedido?.id === pedido.id) pedidoAtualizadoSelecionado = result.data
      }
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (pedidoAtualizadoSelecionado) setSelectedPedido(pedidoAtualizadoSelecionado)
      setSelectedPedidoIds([])
      setLastAlertMessage(
        falhas.length === 0
          ? `${selectedPedidosAvancaveis.length} pedido(s) avancado(s) de etapa.`
          : `${selectedPedidosAvancaveis.length - falhas.length} pedido(s) avancado(s), ${falhas.length} com erro.`
      )
    } finally {
      setBulkActionLoading(null)
    }
  }

  const handleBulkReturnStatus = async () => {
    if (selectedPedidosRetornaveis.length === 0) return
    setBulkActionLoading('return')
    const falhas: string[] = []
    let pedidoAtualizadoSelecionado: Pedido | null = null
    try {
      for (const pedido of selectedPedidosRetornaveis) {
        const previousStatus = getPreviousOperationalStatus(pedido)
        if (!previousStatus) continue
        const result = await patchPedidoStatus(pedido.id, previousStatus)
        if (!result.ok) {
          falhas.push(`#${pedido.id.slice(-8).toUpperCase()}: ${result.error}`)
          continue
        }
        if (selectedPedido?.id === pedido.id) pedidoAtualizadoSelecionado = result.data
      }
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (pedidoAtualizadoSelecionado) setSelectedPedido(pedidoAtualizadoSelecionado)
      setSelectedPedidoIds([])
      setLastAlertMessage(
        falhas.length === 0
          ? `${selectedPedidosRetornaveis.length} pedido(s) retornado(s) de etapa.`
          : `${selectedPedidosRetornaveis.length - falhas.length} pedido(s) retornado(s), ${falhas.length} com erro.`
      )
    } finally {
      setBulkActionLoading(null)
    }
  }

  const handleSendPaymentReminder = async (pedido: Pedido) => {
    let pedidoBase = pedido

    if (pedido.pagamento !== 'DINHEIRO' && pedido.statusPagamento === 'PENDENTE') {
      const pedidoAtualizado = await handleRefreshPaymentLink(pedido)
      if (pedidoAtualizado) {
        pedidoBase = pedidoAtualizado
      }
    }

    const url = buildWhatsappUrl(
      getPedidoWhatsapp(pedidoBase),
      buildPaymentReminderMessage(pedidoBase, { paymentLink: pedidoBase.asaasCheckoutUrl }),
    )
    if (!url) {
      setLastAlertMessage('Esse pedido não possui WhatsApp válido para cobrança.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleResendCurrentStatusMessage = (pedido: Pedido) => {
    if (pedido.status === 'FEITO' || pedido.status === 'CANCELADO') {
      setLastAlertMessage('Este status ainda nao possui mensagem padrao de envio.')
      return
    }

    abrirWhatsappStatus(pedido, pedido.status, config)
  }

  const renderPedidoCard = (pedido: Pedido) => {
    const isSelected = selectedPedidoIds.includes(pedido.id)

    return (
      <Card
        key={pedido.id}
        draggable
        onDragStart={(event) => {
          setDraggedPedidoId(pedido.id)
          event.dataTransfer.setData('text/plain', pedido.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDraggedPedidoId(null)}
        className={`cursor-pointer gap-0 rounded-xl border-border/70 bg-card/95 py-0 transition-all hover:-translate-y-0.5 hover:shadow-md ${draggedPedidoId === pedido.id ? 'opacity-50' : ''} ${isSelected ? 'ring-2 ring-primary/60 border-primary/50' : ''}`}
        onClick={() => { setSelectedPedido(pedido); setCancelReason('') }}
      >
        <CardContent className="p-2.5">
          <div className="flex items-start gap-2">
            <Checkbox
              checked={isSelected}
              aria-label={`Selecionar pedido ${pedido.id.slice(-8).toUpperCase()}`}
              onCheckedChange={(checked) => togglePedidoSelection(pedido.id, checked === true)}
              onClick={(event) => event.stopPropagation()}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">#{pedido.id.slice(-8).toUpperCase()}</p>
                  <p className="truncate text-sm font-semibold leading-tight">{pedido.clienteNome}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold leading-tight text-primary">{formatarMoeda(pedido.total)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatarHora(pedido.criadoEm)}</p>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="truncate">{pedido.pagamento === 'DINHEIRO' ? 'Dinheiro' : getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</span>
                {pedido.tipoEntrega === 'ENCOMENDA' ? (
                  <span className="ml-auto inline-flex text-warning" title="Encomenda" aria-label="Encomenda">
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            </div>
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderPedidoListRow = (pedido: Pedido) => {
    const isSelected = selectedPedidoIds.includes(pedido.id)

    return (
      <div
        key={`list-${pedido.id}`}
        className={`flex items-start gap-2 rounded-xl border bg-card/95 p-2 transition-colors hover:border-primary/35 hover:bg-primary/[0.025] ${isSelected ? 'border-primary/50 ring-1 ring-primary/40' : 'border-border/70'}`}
      >
        <Checkbox
          checked={isSelected}
          aria-label={`Selecionar pedido ${pedido.id.slice(-8).toUpperCase()}`}
          onCheckedChange={(checked) => togglePedidoSelection(pedido.id, checked === true)}
          className="mt-1"
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-label={`Abrir detalhes do pedido ${pedido.id.slice(-8).toUpperCase()}`}
          onClick={() => { setSelectedPedido(pedido); setCancelReason('') }}
        >
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground">#{pedido.id.slice(-8).toUpperCase()}</p>
                <p className="truncate text-sm font-semibold leading-tight">{pedido.clienteNome}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold leading-tight text-primary">{formatarMoeda(pedido.total)}</p>
                <p className="text-[10px] text-muted-foreground">{formatarHora(pedido.criadoEm)}</p>
              </div>
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pedido.pagamento === 'DINHEIRO' ? 'Dinheiro' : getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}</span>
              {pedido.tipoEntrega === 'ENCOMENDA' ? (
                <span className="ml-auto inline-flex shrink-0 text-warning" title="Encomenda" aria-label="Encomenda">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </div>
        </button>
      </div>
    )
  }

  const renderSelectedPedidoSheet = (pedido: Pedido) => {
    const status = statusConfig[pedido.status]
    const canEdit = pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO' && pedido.status !== 'PRONTO_ENTREGA'
    const canResendStatus = pedido.status !== 'FEITO' && pedido.status !== 'CANCELADO'
    const canConfirmPayment = pedido.statusPagamento !== 'APROVADO' && pedido.status !== 'CANCELADO'
    const canCancel = pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO'
    const canDelete = pedido.statusPagamento !== 'APROVADO' || pedido.status === 'CANCELADO'
    const nextStatus = getNextOperationalStatus(pedido)
    const nextStatusLabel = getNextStatusLabel(pedido, nextStatus)
    const paymentStatusLabel = statusPagamentoLabels[pedido.statusPagamento]
    const whatsappDisponivel = Boolean(getPedidoWhatsapp(pedido))
    const onlinePaymentAvailable = pedido.pagamento !== 'DINHEIRO' && pedido.status !== 'CANCELADO'
    const paymentActionLoading = paymentActionPedidoId === pedido.id
    const hostedGateway = inferHostedCheckoutGateway(pedido.asaasCheckoutUrl)
    const hostedGatewayLabel = getHostedGatewayLabel(hostedGateway)
    const itemQuantity = pedido.itens.reduce((acc, item) => acc + item.quantidade, 0)
    const paymentLabel = pedido.pagamento === 'DINHEIRO' ? 'Dinheiro' : getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)

    return (
      <>
        <SheetHeader className="border-b border-border/70 pb-3">
          <div className="pr-6 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">Pedido #{pedido.id.slice(-8).toUpperCase()}</SheetTitle>
                <p className="mt-0.5 truncate text-sm font-medium">{pedido.clienteNome}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-primary">{formatarMoeda(pedido.total)}</p>
                <Badge className={`mt-1 h-5 rounded-md px-1.5 text-[10px] ${status.color}`}>{status.label}</Badge>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                {paymentLabel} · {paymentStatusLabel}
              </span>
              {pedido.tipoEntrega === 'ENCOMENDA' ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-warning">
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{getPedidoPrimaryDateLabel(pedido)}</span>
                </span>
              ) : (
                <span className="truncate">{entregaLabels[pedido.tipoEntrega]}</span>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="mt-3 space-y-3 pb-4">
          <Card className="gap-0 rounded-xl border-border/70 py-0">
            <CardContent className="flex gap-1.5 p-2">
                {pedido.clienteTelefone ? (
                  <Button asChild variant="outline" size="sm" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-xs">
                    <a href={`tel:${pedido.clienteTelefone}`}>
                      <Phone className="h-3.5 w-3.5" />
                      Ligar
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-xs" onClick={() => handleSendPaymentReminder(pedido)} disabled={!whatsappDisponivel}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  Cobrar
                </Button>
                {canEdit ? (
                  <Button variant="outline" size="sm" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-xs" onClick={() => setEditingPedido(pedido)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                ) : null}
            </CardContent>
          </Card>

          <Card className="gap-0 rounded-xl border-border/70 py-0">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm">Ações do pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              {nextStatus ? (
                <div>
                  <Button className="h-9 w-full rounded-lg" onClick={() => handleUpdateStatus(pedido, nextStatus)} disabled={updatingStatus === pedido.id}>
                    {updatingStatus === pedido.id ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {nextStatusLabel}
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                {canResendStatus ? (
                  <Button variant="outline" size="sm" className="h-8 w-full rounded-lg text-xs" onClick={() => handleResendCurrentStatusMessage(pedido)}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    Reenviar status
                  </Button>
                ) : null}
                {canConfirmPayment ? (
                  <Button variant="outline" size="sm" className="h-8 w-full rounded-lg text-xs" onClick={() => handleConfirmPayment(pedido.id)} disabled={confirmingPaymentId === pedido.id}>
                    {confirmingPaymentId === pedido.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                    Confirmar pagamento
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <details className="group rounded-xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Package className="h-4 w-4" />Itens e valores</span>
              <span className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground">{itemQuantity} un. · {formatarMoeda(pedido.total)}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
            </summary>
            <div className="space-y-2 border-t border-border/60 p-3">
              {pedido.itens.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.quantidade}x {item.nomeProdutoSnapshot}</p>
                    <p className="text-xs text-muted-foreground">{formatarMoeda(item.precoUnitarioSnapshot)} cada</p>
                  </div>
                  <span className="shrink-0 font-semibold">{formatarMoeda(item.totalItem)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-xs"><span>Subtotal</span><span>{formatarMoeda(pedido.subtotal)}</span></div>
              {pedido.frete > 0 ? <div className="flex justify-between text-xs"><span>Frete</span><span>{formatarMoeda(pedido.frete)}</span></div> : null}
              {pedido.descontoValor && pedido.descontoValor > 0 ? (
                <div className="flex justify-between text-xs text-success"><span>{pedido.cupomCodigoSnapshot ? 'Desconto' : 'Valor promocional'}</span><span>-{formatarMoeda(pedido.descontoValor)}</span></div>
              ) : null}
              {pedido.cupomCodigoSnapshot ? <div className="flex justify-between text-xs"><span>Cupom</span><span>{pedido.cupomCodigoSnapshot}</span></div> : null}
              <div className="flex justify-between border-t border-border/70 pt-2 font-bold"><span>Total</span><span className="text-primary">{formatarMoeda(pedido.total)}</span></div>
            </div>
          </details>

          <details className="group rounded-xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><User className="h-4 w-4" />Cliente e entrega</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-border/60 p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Contato</p>
                  <p className="truncate font-medium">{pedido.clienteNome}</p>
                  <p className="break-all text-xs text-muted-foreground">{pedido.clienteTelefone ? formatarTelefone(pedido.clienteTelefone) : 'Celular não informado'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Entrega</p>
                  <p className="font-medium">{entregaLabels[pedido.tipoEntrega]}</p>
                  <p className="text-xs text-muted-foreground">
                    {pedido.tipoEntrega === 'RESERVA_PAULISTANO'
                      ? `Bloco ${pedido.clienteBloco || '-'} • Apto ${pedido.clienteApartamento || '-'}`
                      : pedido.tipoEntrega === 'RETIRADA'
                        ? pedido.enderecoRetirada
                        : `Entrega em ${pedido.encomendaPara ? formatDateTimeInSaoPaulo(pedido.encomendaPara) : '-'}`}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <p>Pedido feito em {formatDateTimeInSaoPaulo(pedido.criadoEm)}</p>
                {pedido.responsavelPedido ? <p className="break-words">Responsável: {pedido.responsavelPedido}</p> : null}
                {pedido.destinatariosPedido ? <p className="break-words">Separar para: {pedido.destinatariosPedido}</p> : null}
                {pedido.levadoEm ? <p>Levado em {formatDateTimeInSaoPaulo(pedido.levadoEm)}</p> : null}
                {pedido.observacoesPedido ? <p className="rounded-lg bg-muted/30 p-2 text-foreground">{pedido.observacoesPedido}</p> : null}
              </div>
            </div>
          </details>

          <details className="group rounded-xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><CreditCard className="h-4 w-4" />Ajustar pagamento</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-border/60 p-3">
              {pedido.status !== 'CANCELADO' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Status do pagamento</Label>
                  <Select value={pedido.statusPagamento} onValueChange={(value) => handleUpdatePaymentStatus(pedido.id, value as Pedido['statusPagamento'])}>
                    <SelectTrigger className="h-9 w-full rounded-lg bg-background" disabled={confirmingPaymentId === pedido.id}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NAO_APLICAVEL">Na entrega</SelectItem>
                      <SelectItem value="PENDENTE">Pendente</SelectItem>
                      <SelectItem value="APROVADO">Aprovado</SelectItem>
                      <SelectItem value="RECUSADO">Recusado</SelectItem>
                      <SelectItem value="CANCELADO">Cancelado</SelectItem>
                      <SelectItem value="REEMBOLSADO">Reembolsado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {onlinePaymentAvailable ? (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">Link atual: <span className="font-semibold text-foreground">{hostedGatewayLabel}</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => handleCopyPaymentLink(pedido)}
                      disabled={paymentActionLoading}
                    >
                      {paymentActionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                      Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => void handleRefreshPaymentLink(pedido)}
                      disabled={paymentActionLoading}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${paymentActionLoading ? 'animate-spin' : ''}`} />
                      Validar link
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full rounded-lg text-xs"
                    onClick={() => {
                      setPaymentMethodDialogPedido(pedido)
                      setPaymentMethodValue(
                        pedido.pagamento === 'PIX'
                          ? 'PIX'
                          : pedido.pagamento === 'DINHEIRO'
                            ? 'DINHEIRO'
                            : pedido.tipoCartao === 'DEBITO'
                              ? 'CARTAO_DEBITO'
                              : 'CARTAO_CREDITO',
                      )
                    }}
                    disabled={paymentActionLoading || pedido.statusPagamento === 'APROVADO'}
                  >
                    <Pencil className="h-3.5 w-3.5" />Trocar forma
                  </Button>
                </div>
              ) : null}
            </div>
          </details>

          <details className="group rounded-xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
              <span>Mover manualmente</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
                  {kanbanColumns
                    .filter((column) => column.status !== pedido.status && canMovePedido(pedido, column.status))
                    .map((column) => (
                      <Button
                        key={column.status}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full rounded-lg text-xs"
                        onClick={() => handleUpdateStatus(pedido, column.status)}
                        disabled={updatingStatus === pedido.id}
                      >
                        {column.title}
                      </Button>
                    ))}
            </div>
          </details>

          {(canCancel || canDelete || pedido.status === 'CANCELADO') ? (
            <details className="group rounded-xl border border-destructive/30 bg-destructive/[0.03]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-destructive">
                <span>Ações administrativas</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-destructive/20 p-3">
                {pedido.status === 'CANCELADO' ? <p className="text-xs text-muted-foreground">Motivo: {pedido.motivoCancelamento || 'Não informado'}</p> : null}
                {canCancel ? (
                  <>
                    <Textarea placeholder="Motivo do cancelamento" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={2} className="rounded-lg text-sm" />
                    <Button variant="destructive" size="sm" className="h-8 w-full rounded-lg text-xs" onClick={() => handleCancelPedido(pedido.id)} disabled={isCancelling || !cancelReason.trim()}>
                      {isCancelling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}Cancelar pedido
                    </Button>
                  </>
                ) : null}
                {canDelete ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="h-8 w-full rounded-lg border-destructive/40 text-xs text-destructive">Excluir pedido</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir pedido definitivamente?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação remove o pedido da base e não é possível desfazer. Pedidos pagos só podem ser excluídos quando estão cancelados.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel><X className="mr-0 h-4 w-4 md:mr-2" /><span className="hidden md:inline">Voltar</span></AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletePedido(pedido.id)} disabled={deletingPedidoId === pedido.id}>
                          {deletingPedidoId === pedido.id ? <RefreshCw className="mr-0 h-4 w-4 animate-spin md:mr-2" /> : <Trash2 className="mr-0 h-4 w-4 md:mr-2" />}
                          <span className="hidden md:inline">{deletingPedidoId === pedido.id ? 'Excluindo...' : 'Excluir'}</span>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/14 via-background to-secondary/12 p-3 shadow-sm md:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-xl font-bold md:text-2xl">Pedidos</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Venda, confirme e avance pedidos com poucos toques.
            </p>
          </div>
          <div className="w-full xl:max-w-[34rem]">
            <Button variant="default" size="sm" className="h-10 w-full justify-center rounded-xl text-sm font-medium" onClick={() => setNewOrderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo pedido
            </Button>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              <Button variant="outline" size="sm" className="h-8 justify-center rounded-lg px-2 text-xs whitespace-nowrap" onClick={() => setStockLookupOpen(true)}>
                <Archive className="mr-2 h-4 w-4" />
                Estoque
              </Button>
              {alertsEnabled && !soundUnlocked && (
                <Button variant="outline" size="sm" className="h-8 justify-center rounded-lg px-2 text-xs whitespace-nowrap" onClick={handleUnlockSound}>
                  <Volume2 className="mr-2 h-4 w-4" />
                  Ativar som
                </Button>
              )}
              <Button variant={alertsEnabled ? 'default' : 'outline'} size="sm" className="h-8 justify-center rounded-lg px-2 text-xs" onClick={alertsEnabled ? handleDisableAlerts : handleEnableAlerts}>
                {alertsEnabled ? <BellRing className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
                <span className="sm:hidden">{alertsEnabled ? 'Alertas on' : 'Alertas'}</span>
                <span className="hidden sm:inline">{alertsEnabled ? 'Alertas ativos' : 'Ativar alertas'}</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 justify-center rounded-lg px-2 text-xs whitespace-nowrap" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {resumoCards.map((card) => (
          <Card key={card.key} className="gap-0 rounded-xl border-border/70 bg-card/95 py-0">
            <CardContent className="p-2.5 sm:p-3">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{card.label}</p>
              <p className="mt-0.5 text-xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <details className="group rounded-xl border border-border/70 bg-card/90">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <span className="font-semibold">Pagamentos online</span>
            <span className="ml-2 text-xs text-muted-foreground">{hostedCheckoutResumo.onlinePendentes} pendente(s)</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">MP {hostedCheckoutResumo.mercadoPago}</Badge>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <div className="border-t border-border/60 p-3">
          <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className={getGatewayBadgeClass('MERCADO_PAGO')}>
                Mercado Pago {hostedCheckoutResumo.mercadoPago}
              </Badge>
              {hostedCheckoutResumo.asaas > 0 ? (
                <Badge variant="outline" className={getGatewayBadgeClass('ASAAS')}>
                  Asaas legado {hostedCheckoutResumo.asaas}
                </Badge>
              ) : null}
              {hostedCheckoutResumo.manual > 0 ? (
                <Badge variant="outline" className={getGatewayBadgeClass(null)}>
                  Manual {hostedCheckoutResumo.manual}
                </Badge>
              ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/70 bg-background/70 p-2.5">
              <p className="text-xs text-muted-foreground">Pagamentos online pendentes</p>
              <p className="mt-1 text-xl font-bold">{hostedCheckoutResumo.onlinePendentes}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-2.5">
              <p className="text-xs text-muted-foreground">Pagamentos online aprovados</p>
              <p className="mt-1 text-xl font-bold">{hostedCheckoutResumo.onlineAprovados}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-2.5">
              <p className="text-xs text-muted-foreground">Pedidos em dinheiro</p>
              <p className="mt-1 text-xl font-bold">{hostedCheckoutResumo.dinheiro}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-2.5">
              <p className="text-xs text-muted-foreground">Sem link hospedado</p>
              <p className="mt-1 text-xl font-bold">{hostedCheckoutResumo.manual}</p>
            </div>
          </div>
        </div>
      </details>

      <Card className="gap-0 rounded-xl border-primary/15 bg-card/90 py-0">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar cliente, item ou numero"
                className="h-9 rounded-lg pl-9"
              />
            </div>
            <Button type="button" variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'} size="sm" className="h-9 rounded-lg px-2.5" onClick={() => setFiltersOpen((current) => !current)}>
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
            </Button>
          </div>

          {filtersOpen ? (
          <div className="mt-3 border-t border-border/60 pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Exibindo {pedidosFiltrados.length} de {pedidos?.length || 0} pedidos.</span>
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusPedido | 'TODOS')}>
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
            <div className="space-y-2">
              <Label className="text-xs">Pagamento</Label>
              <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as 'TODOS' | Pedido['pagamento'])}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="CARTAO">Cartao</SelectItem>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Status pag.</Label>
              <Select value={paymentStatusFilter} onValueChange={(value) => setPaymentStatusFilter(value as 'TODOS' | Pedido['statusPagamento'])}>
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
              <Label className="text-xs">Dia da tela</Label>
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </div>
          </div>

          </div>
          ) : null}
        </CardContent>
      </Card>

      {lastAlertMessage && (
        <Card className={alertsEnabled ? 'border-primary/40 bg-primary/5' : 'border-muted'}>
          <CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">{alertsEnabled ? <BellRing className="mt-0.5 h-4 w-4 text-primary" /> : <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />}<span className="break-words">{lastAlertMessage}</span></div>
            {notificationPermission === 'denied' && <span className="text-xs text-muted-foreground">Permissao do navegador bloqueada</span>}
          </CardContent>
        </Card>
      )}

      {selectedPedidoIds.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-primary/35 bg-primary/[0.055]" aria-label="Ações dos pedidos selecionados">
          <div className="flex items-center justify-between gap-2 border-b border-primary/15 px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold">{selectedPedidoIds.length} selecionado(s)</p>
              <p className="truncate text-[10px] text-muted-foreground">Escolha uma ação em lote</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-md px-2 text-xs" onClick={handleClearSelection}>
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto p-2">
            <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-xs" onClick={handleSelectAllFiltered} disabled={pedidosFiltrados.length === 0}>
              Selecionar filtrados
            </Button>
            {selectedPedidosRetornaveis.length > 0 ? (
              <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-xs" onClick={handleBulkReturnStatus} disabled={bulkActionLoading !== null}>
                {bulkActionLoading === 'return' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 rotate-90" />}
                Retornar ({selectedPedidosRetornaveis.length})
              </Button>
            ) : null}
            {selectedPedidosAvancaveis.length > 0 ? (
              <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-xs" onClick={handleBulkAdvanceStatus} disabled={bulkActionLoading !== null}>
                {bulkActionLoading === 'advance' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Avançar ({selectedPedidosAvancaveis.length})
              </Button>
            ) : null}
            {selectedPedidosEntregaveis.length > 0 ? (
              <Button size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-xs" onClick={handleBulkMarkDelivered} disabled={bulkActionLoading !== null}>
                {bulkActionLoading === 'deliver' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                Entregar ({selectedPedidosEntregaveis.length})
              </Button>
            ) : null}
            {selectedPedidosPagamentoPendente.length > 0 ? (
              <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-xs" onClick={handleBulkConfirmPayment} disabled={bulkActionLoading !== null}>
                {bulkActionLoading === 'payment' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                Pagamento ({selectedPedidosPagamentoPendente.length})
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{pedidosFiltrados.length} pedido(s) na visualização</span>
          {viewMode === 'LISTA' && listColumnsWithPedidos.length > 0 ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-[11px]" onClick={collapseAllListPhases}>
                Recolher
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-[11px]" onClick={expandAllListPhases}>
                Expandir
              </Button>
            </>
          ) : null}
        </div>
        <div className="grid grid-cols-2 rounded-lg border border-border/70 bg-card p-0.5">
          <Button type="button" variant={viewMode === 'LISTA' ? 'default' : 'ghost'} size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => changeViewMode('LISTA')}>
            <List className="h-3.5 w-3.5" />
            Lista
          </Button>
          <Button type="button" variant={viewMode === 'KANBAN' ? 'default' : 'ghost'} size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => changeViewMode('KANBAN')}>
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={viewMode === 'LISTA' ? 'space-y-2' : 'overflow-x-auto pb-2'}>
          {viewMode === 'LISTA'
            ? [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[74px] w-full rounded-xl" />)
            : <div className="flex min-w-max gap-3">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-80 w-[270px] sm:w-[300px]" />)}</div>}
        </div>
      ) : viewMode === 'LISTA' ? (
        <div className="space-y-3">
          {pedidosFiltrados.length ? listColumnsWithPedidos.map((column) => {
            const phasePedidos = pedidosPorStatus[column.status] ?? []
            const PhaseIcon = statusConfig[column.status].icon
            const isOpen = !collapsedListStatuses.has(column.status)

            return (
              <Collapsible key={`list-phase-${column.status}`} open={isOpen} onOpenChange={(open) => setListPhaseOpen(column.status, open)}>
                <section className="overflow-hidden rounded-xl border border-border/70 bg-card/45" aria-labelledby={`list-phase-title-${column.status}`}>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/35" aria-expanded={isOpen}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${statusConfig[column.status].color}`}>
                        <PhaseIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <h2 id={`list-phase-title-${column.status}`} className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                        {column.title}
                      </h2>
                      <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{phasePedidos.length}</span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1.5 border-t border-border/60 p-1.5">
                      {phasePedidos.map(renderPedidoListRow)}
                    </div>
                  </CollapsibleContent>
                </section>
              </Collapsible>
            )
          }) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum pedido encontrado com os filtros atuais.
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max snap-x snap-mandatory gap-3">
          {kanbanColumns.map(column => {
            const columnPedidos = pedidosPorStatus[column.status] ?? []
            const StatusIcon = statusConfig[column.status].icon
            return (
              <div key={column.status} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => handleDrop(event, column.status)} className={`min-h-[320px] w-[82vw] max-w-[300px] shrink-0 snap-start rounded-xl border p-2.5 sm:w-[300px] xl:w-[calc((100vw-24rem)/6)] xl:min-w-[210px] ${statusConfig[column.status].columnClass}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><div className={`rounded-lg p-1.5 ${statusConfig[column.status].color}`}><StatusIcon className="h-3.5 w-3.5" /></div><div><h2 className="text-sm font-semibold">{column.title}</h2><p className="text-[10px] text-muted-foreground">{column.hint}</p></div></div>
                  <Badge variant="secondary">{columnPedidos.length}</Badge>
                </div>
                <div className="space-y-2">
                  {columnPedidos.length === 0 ? <Card className="gap-0 border-dashed bg-background/50 py-0"><CardContent className="py-6 text-center text-xs text-muted-foreground">Nenhum pedido</CardContent></Card> : columnPedidos.map(renderPedidoCard)}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      <Sheet open={!!selectedPedido} onOpenChange={() => { setSelectedPedido(null); setCancelReason('') }}>
        <SheetContent className="w-full overflow-y-auto px-3 sm:max-w-lg sm:px-4">
          {selectedPedido ? renderSelectedPedidoSheet(selectedPedido) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-h-[96dvh] w-[calc(100vw-0.35rem)] max-w-[calc(100vw-0.35rem)] overflow-y-auto overflow-x-hidden p-2 sm:max-w-none sm:p-4 lg:w-[min(calc(100vw-2rem),1120px)]">
          <DialogHeader className="sr-only">
            <DialogTitle>Novo pedido manual</DialogTitle>
          </DialogHeader>
          <NovoPedidoAdminPage
            compact
            onCreated={() => {
              mutate(pedidosUrl)
              window.setTimeout(() => setNewOrderOpen(false), 900)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={stockLookupOpen} onOpenChange={setStockLookupOpen}>
        <DialogContent className="max-h-[88vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto p-3 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Consulta rápida de estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Atalho para venda: veja o que está livre agora e o que já está reservado.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => mutateEstoqueConsulta()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar sabor</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Digite o sabor ou categoria" className="pl-9" />
              </div>
            </div>

            {isLoadingEstoqueConsulta ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : estoqueConsultaFiltrado.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {estoqueConsultaFiltrado.map((item) => (
                  <Card key={item.produtoId} className={item.quantidadeDisponivel > 0 ? 'border-primary/20' : 'border-warning/35'}>
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <p className="font-semibold">{item.nomeProduto}</p>
                        <p className="text-sm text-muted-foreground">{item.categoriaNome}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg bg-muted/35 p-3">
                          <p className="text-xs text-muted-foreground">Disponível</p>
                          <p className={`text-xl font-bold ${item.quantidadeDisponivel > 0 ? 'text-primary' : 'text-warning-foreground'}`}>{item.quantidadeDisponivel}</p>
                        </div>
                        <div className="rounded-lg bg-muted/35 p-3">
                          <p className="text-xs text-muted-foreground">Reservado</p>
                          <p className="text-xl font-bold">{item.quantidadeReservada}</p>
                        </div>
                        <div className="rounded-lg bg-muted/35 p-3">
                          <p className="text-xs text-muted-foreground">Projetado</p>
                          <p className={`text-xl font-bold ${item.saldoProjetado < 0 ? 'text-destructive' : 'text-success'}`}>{item.saldoProjetado}</p>
                        </div>
                      </div>
                      {item.quantidadeDisponivel <= 0 && (
                        <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground">
                          Sem saldo livre no momento para venda imediata.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum sabor encontrado para essa busca.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentMethodDialogPedido} onOpenChange={(open) => { if (!open) setPaymentMethodDialogPedido(null) }}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Trocar forma de pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Para evitar cobranca duplicada, a troca online so acontece quando o link anterior nao esta mais ativo.
            </p>

            <div className="space-y-2">
              <Label>Novo pagamento</Label>
              <Select value={paymentMethodValue} onValueChange={(value) => setPaymentMethodValue(value as typeof paymentMethodValue)}>
                <SelectTrigger className="w-full rounded-2xl bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  <SelectItem value="PIX">Pix</SelectItem>
                  <SelectItem value="CARTAO_CREDITO">Cartao credito</SelectItem>
                  <SelectItem value="CARTAO_DEBITO">Cartao debito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl"
                onClick={() => setPaymentMethodDialogPedido(null)}
              >
                Fechar
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-2xl"
                onClick={() => void handleSwitchPaymentMethod()}
                disabled={!paymentMethodDialogPedido || paymentActionPedidoId === paymentMethodDialogPedido.id}
              >
                {paymentMethodDialogPedido && paymentActionPedidoId === paymentMethodDialogPedido.id ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Salvar pagamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPedido} onOpenChange={(open) => { if (!open) setEditingPedido(null) }}>
        <DialogContent className="flex h-[min(94dvh,860px)] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-0 sm:max-w-none lg:w-[min(calc(100vw-3rem),1120px)]">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base">Editar pedido</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2 sm:p-4">
            {editingPedido && (
              <NovoPedidoAdminPage
                compact
                initialPedido={editingPedido}
                onSaved={(pedido) => {
                  mutate(pedidosUrl)
                  setSelectedPedido(pedido)
                  setEditingPedido(null)
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

