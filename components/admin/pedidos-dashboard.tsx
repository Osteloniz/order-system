'use client'

import type { DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Archive, Bell, BellRing, Check, ChefHat, Clock, CreditCard, Filter, GripVertical, MapPin, MessageCircle, Package, Pencil, Phone, Plus, RefreshCw, Search, Trash2, Truck, User, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { buildPaymentReminderMessage, buildStatusMessage, hydrateConfigWithMessageDefaults } from '@/lib/message-templates'
import { entregaLabels, getPagamentoLabel, statusPagamentoColors, statusPagamentoLabels } from '@/lib/order-display'
import { buildWhatsappUrl } from '@/lib/phone'
import { formatDateTimeInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'
import type { Configuracao, Pedido, StatusPedido } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const statusConfig: Record<StatusPedido, { label: string; color: string; columnClass: string; icon: typeof Clock; nextStatus?: StatusPedido; nextLabel?: string }> = {
  FEITO: { label: 'Novo', color: 'bg-warning text-warning-foreground', columnClass: 'border-warning/40 bg-warning/5', icon: Clock, nextStatus: 'ACEITO', nextLabel: 'Aceitar Pedido' },
  ACEITO: { label: 'Aceito', color: 'bg-accent text-accent-foreground', columnClass: 'border-accent/40 bg-accent/5', icon: Check, nextStatus: 'PREPARACAO', nextLabel: 'Iniciar Preparo' },
  PREPARACAO: { label: 'Preparando', color: 'bg-primary text-primary-foreground', columnClass: 'border-primary/40 bg-primary/5', icon: ChefHat, nextStatus: 'ENTREGUE', nextLabel: 'Marcar Entregue' },
  ENTREGUE: { label: 'Entregue', color: 'bg-success text-success-foreground', columnClass: 'border-success/40 bg-success/5', icon: Truck },
  CANCELADO: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground', columnClass: 'border-destructive/40 bg-destructive/5', icon: X }
}

const kanbanColumns: { status: StatusPedido; title: string; hint: string }[] = [
  { status: 'FEITO', title: 'Novos', hint: 'Aguardando aceite' },
  { status: 'ACEITO', title: 'Aceitos', hint: 'Aguardando preparo' },
  { status: 'PREPARACAO', title: 'Em preparo', hint: 'Producao em andamento' },
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

function resumirItens(pedido: Pedido) {
  const primeirosItens = pedido.itens.slice(0, 2).map(item => `${item.quantidade}x ${item.nomeProdutoSnapshot}`).join(', ')
  const restantes = pedido.itens.length - 2
  return restantes > 0 ? `${primeirosItens} +${restantes}` : primeirosItens
}

function abrirWhatsappStatus(pedido: Pedido, status: StatusPedido, config?: Configuracao | null) {
  const mensagem = buildStatusMessage(pedido, status, config)
  const url = buildWhatsappUrl(getPedidoWhatsapp(pedido), mensagem)
  if (!url || !mensagem) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function canMovePedido(pedido: Pedido, targetStatus: StatusPedido) {
  return pedido.status !== targetStatus
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

function getNextStatus(status: StatusPedido) {
  if (status === 'FEITO') return 'ACEITO' as const
  if (status === 'ACEITO') return 'PREPARACAO' as const
  if (status === 'PREPARACAO') return 'ENTREGUE' as const
  return null
}

function getPreviousStatus(status: StatusPedido) {
  if (status === 'ACEITO') return 'FEITO' as const
  if (status === 'PREPARACAO') return 'ACEITO' as const
  if (status === 'ENTREGUE') return 'PREPARACAO' as const
  return null
}

export function PedidosDashboard() {
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [deletingPedidoId, setDeletingPedidoId] = useState<string | null>(null)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)
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
  const [stockLookupOpen, setStockLookupOpen] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const seenPedidoIdsRef = useRef<Set<string>>(new Set())
  const initialPedidosLoadedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  const pedidosUrl = `/api/admin/pedidos?date=${dateFilter}&carryoverNovos=1`
  const { data: pedidos, isLoading } = useSWR<Pedido[]>(pedidosUrl, fetcher, { refreshInterval: 5000 })
  const { data: rawConfig } = useSWR<Configuracao>('/api/admin/config', fetcher)
  const estoqueConsultaUrl = `/api/admin/producao?from=${todayInSaoPaulo()}&to=${todayInSaoPaulo()}`
  const { data: estoqueConsulta, isLoading: isLoadingEstoqueConsulta, mutate: mutateEstoqueConsulta } = useSWR<EstoqueConsultaData>(stockLookupOpen ? estoqueConsultaUrl : null, fetcher, { refreshInterval: 15000 })
  const config = hydrateConfigWithMessageDefaults(rawConfig)

  const contadores = {
    novos: pedidos?.filter(p => p.status === 'FEITO').length || 0,
    aceitos: pedidos?.filter(p => p.status === 'ACEITO').length || 0,
    preparando: pedidos?.filter(p => p.status === 'PREPARACAO').length || 0,
    entregues: pedidos?.filter(p => p.status === 'ENTREGUE').length || 0,
    cancelados: pedidos?.filter(p => p.status === 'CANCELADO').length || 0,
    todos: pedidos?.length || 0
  }

  const resumoCards = [
    { key: 'novos', label: 'Novos', value: contadores.novos },
    { key: 'aceitos', label: 'Aceitos', value: contadores.aceitos },
    { key: 'preparando', label: 'Em preparo', value: contadores.preparando },
    { key: 'entregues', label: 'Entregues', value: contadores.entregues },
    { key: 'total', label: 'Total', value: contadores.todos },
  ]

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
    () => selectedPedidos.filter((pedido) => !!getNextStatus(pedido.status)),
    [selectedPedidos]
  )

  const selectedPedidosRetornaveis = useMemo(
    () => selectedPedidos.filter((pedido) => !!getPreviousStatus(pedido.status)),
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
  }, [alertsEnabled, pedidos])

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
      error: data?.error || 'Nao foi possivel atualizar o status.',
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
      error: data?.error || 'Nao foi possivel atualizar o pagamento.',
    }
  }

  const handleEnableAlerts = async () => {
    await unlockAlertSound()
    let permission = getNotificationPermission()
    if ('Notification' in window && Notification.permission === 'default') permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setLastAlertMessage(permission === 'denied' ? 'Notificacoes bloqueadas no navegador. O som interno continua ativo enquanto a aba permitir audio.' : 'Alertas ativados para novos pedidos.')
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
      setLastAlertMessage(`Movimento nao permitido: ${statusConfig[pedido.status].label} para ${statusConfig[targetStatus].label}.`)
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
      const pedidoAtualizado = result.data
      mutate(pedidosUrl)
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
    } finally {
      setConfirmingPaymentId(null)
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
        const nextStatus = getNextStatus(pedido.status)
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
        const previousStatus = getPreviousStatus(pedido.status)
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

  const handleSendPaymentReminder = (pedido: Pedido) => {
    const url = buildWhatsappUrl(getPedidoWhatsapp(pedido), buildPaymentReminderMessage(pedido))
    if (!url) {
      setLastAlertMessage('Esse pedido nao possui WhatsApp valido para cobranca.')
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
    const status = statusConfig[pedido.status]
    const StatusIcon = status.icon
    const isUpdating = updatingStatus === pedido.id
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
        className={`cursor-pointer border-border/70 bg-card/95 transition-all hover:-translate-y-0.5 hover:shadow-md ${draggedPedidoId === pedido.id ? 'opacity-50' : ''} ${isSelected ? 'ring-2 ring-primary/60 border-primary/50' : ''}`}
        onClick={() => { setSelectedPedido(pedido); setCancelReason('') }}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                checked={isSelected}
                aria-label={`Selecionar pedido ${pedido.id.slice(-8).toUpperCase()}`}
                onCheckedChange={(checked) => togglePedidoSelection(pedido.id, checked === true)}
                onClick={(event) => event.stopPropagation()}
              />
              <div className={`rounded-full p-2 ${status.color}`}><StatusIcon className="h-4 w-4" /></div>
              <div className="min-w-0"><p className="truncate font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p><p className="truncate text-sm text-muted-foreground">{pedido.clienteNome}</p></div>
            </div>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="rounded-lg bg-muted/45 p-3 text-sm text-muted-foreground"><p className="line-clamp-2">{resumirItens(pedido)}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">{entregaLabels[pedido.tipoEntrega]}</Badge>
            {pedido.encomendaPara && <Badge variant="secondary" className="text-xs">{new Date(pedido.encomendaPara).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</Badge>}
            <Badge className={statusPagamentoColors[pedido.statusPagamento]}>{statusPagamentoLabels[pedido.statusPagamento]}</Badge>
          </div>
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{new Date(pedido.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} {formatarHora(pedido.criadoEm)}</span><span className="font-bold text-primary">{formatarMoeda(pedido.total)}</span></div>
          {isUpdating && <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" />Atualizando status...</div>}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Arraste os cards livremente entre as colunas. O estoque e as reservas sao ajustados automaticamente.</p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
          <Button variant="default" size="sm" className="justify-center" onClick={() => setNewOrderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo pedido
          </Button>
          <Button variant="outline" size="sm" className="justify-center" onClick={() => setStockLookupOpen(true)}>
            <Archive className="mr-2 h-4 w-4" />
            Estoque
          </Button>
          {alertsEnabled && !soundUnlocked && (
            <Button variant="outline" size="sm" className="justify-center" onClick={handleUnlockSound}>
              <Volume2 className="mr-2 h-4 w-4" />
              Ativar som
            </Button>
          )}
          <Button variant={alertsEnabled ? 'default' : 'outline'} size="sm" className="justify-center" onClick={alertsEnabled ? handleDisableAlerts : handleEnableAlerts}>
            {alertsEnabled ? <BellRing className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
            {alertsEnabled ? 'Alertas ativos' : 'Ativar alertas'}
          </Button>
          <Button variant="outline" size="sm" className="justify-center xl:col-span-1" onClick={handleRefresh}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {resumoCards.map((card) => (
          <Card key={card.key} className="border-border/70 bg-card/95">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/15 bg-card/90">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Filter className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">Busca e filtros</p>
                  <p className="text-sm text-muted-foreground">Encontre rapido por cliente, item, pagamento e data da operacao.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Exibindo {pedidosFiltrados.length} de {pedidos?.length || 0} pedidos.</span>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
            <div className="space-y-2">
              <Label>Buscar pedido</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Numero, nome, telefone, bloco ou item"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusPedido | 'TODOS')}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="FEITO">Novos</SelectItem>
                  <SelectItem value="ACEITO">Aceitos</SelectItem>
                  <SelectItem value="PREPARACAO">Em preparo</SelectItem>
                  <SelectItem value="ENTREGUE">Entregues</SelectItem>
                  <SelectItem value="CANCELADO">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pagamento</Label>
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
              <Label>Status pag.</Label>
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
              <Label>Dia da tela</Label>
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            Pedidos em aberto de dias anteriores continuam visiveis nesta tela.
          </div>
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

      <Card className={selectedPedidoIds.length > 0 ? 'border-primary/35 bg-primary/5' : 'border-dashed border-border/70'}>
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {selectedPedidoIds.length > 0 ? `${selectedPedidoIds.length} pedido(s) selecionado(s)` : 'Selecione pedidos para agir em lote'}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedPedidoIds.length > 0
                ? `${selectedPedidosAvancaveis.length} podem avancar, ${selectedPedidosRetornaveis.length} podem retornar e ${selectedPedidosPagamentoPendente.length} podem ter pagamento confirmado.`
                : 'Use o checkbox de cada card ou selecione todos os pedidos filtrados.'}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Button variant="outline" size="sm" onClick={handleSelectAllFiltered} disabled={pedidosFiltrados.length === 0}>
              Selecionar filtrados
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearSelection} disabled={selectedPedidoIds.length === 0}>
              Limpar selecao
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkReturnStatus} disabled={selectedPedidosRetornaveis.length === 0 || bulkActionLoading !== null}>
              {bulkActionLoading === 'return' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Retornar etapa
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkAdvanceStatus} disabled={selectedPedidosAvancaveis.length === 0 || bulkActionLoading !== null}>
              {bulkActionLoading === 'advance' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Avancar etapa
            </Button>
            <Button size="sm" onClick={handleBulkMarkDelivered} disabled={selectedPedidosEntregaveis.length === 0 || bulkActionLoading !== null}>
              {bulkActionLoading === 'deliver' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              Tudo entregue
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkConfirmPayment} disabled={selectedPedidosPagamentoPendente.length === 0 || bulkActionLoading !== null}>
              {bulkActionLoading === 'payment' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Confirmar pagamentos
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-96 w-[280px] sm:w-[320px]" />)}</div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max snap-x snap-mandatory gap-4">
          {kanbanColumns.map(column => {
            const columnPedidos = pedidosPorStatus[column.status] ?? []
            const StatusIcon = statusConfig[column.status].icon
            return (
              <div key={column.status} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => handleDrop(event, column.status)} className={`min-h-[360px] w-[280px] shrink-0 snap-start rounded-2xl border p-3 sm:w-[320px] xl:w-[calc((100vw-24rem)/5)] xl:min-w-[220px] ${statusConfig[column.status].columnClass}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><div className={`rounded-full p-2 ${statusConfig[column.status].color}`}><StatusIcon className="h-4 w-4" /></div><div><h2 className="font-semibold">{column.title}</h2><p className="text-xs text-muted-foreground">{column.hint}</p></div></div>
                  <Badge variant="secondary">{columnPedidos.length}</Badge>
                </div>
                <div className="space-y-3">
                  {columnPedidos.length === 0 ? <Card className="border-dashed bg-background/50"><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido</CardContent></Card> : columnPedidos.map(renderPedidoCard)}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      <Sheet open={!!selectedPedido} onOpenChange={() => { setSelectedPedido(null); setCancelReason('') }}>
        <SheetContent className="w-full overflow-y-auto px-4 sm:max-w-lg">
          {selectedPedido && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-col items-start gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between"><span className="break-words">Pedido #{selectedPedido.id.slice(-8).toUpperCase()}</span><Badge className={statusConfig[selectedPedido.status].color}>{statusConfig[selectedPedido.status].label}</Badge></SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="space-y-4 p-4">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">{selectedPedido.clienteNome}</p>
                      <p className="text-sm text-muted-foreground">{getPedidoPrimaryDateLabel(selectedPedido)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold text-primary">{formatarMoeda(selectedPedido.total)}</p>
                      </div>
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="text-xs text-muted-foreground">Pagamento</p>
                        <p className="font-medium">{getPagamentoLabel(selectedPedido.pagamento, selectedPedido.tipoCartao)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{entregaLabels[selectedPedido.tipoEntrega]}</Badge>
                      <Badge className={statusPagamentoColors[selectedPedido.statusPagamento]}>{statusPagamentoLabels[selectedPedido.statusPagamento]}</Badge>
                      {selectedPedido.tipoEntrega === 'ENCOMENDA' ? <Badge variant="outline">Encomenda</Badge> : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedPedido.clienteTelefone ? (
                        <Button asChild variant="outline" className="w-full">
                          <a href={`tel:${selectedPedido.clienteTelefone}`}>
                            <Phone className="mr-2 h-4 w-4" />
                            Ligar
                          </a>
                        </Button>
                      ) : null}
                      <Button variant="outline" className="w-full" onClick={() => handleSendPaymentReminder(selectedPedido)} disabled={!getPedidoWhatsapp(selectedPedido)}>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Cobrar no WhatsApp
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Acoes rapidas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {statusConfig[selectedPedido.status].nextStatus && (
                      <div className="space-y-2">
                        <Button className="w-full" onClick={() => handleUpdateStatus(selectedPedido, statusConfig[selectedPedido.status].nextStatus!)} disabled={updatingStatus === selectedPedido.id}>
                          {updatingStatus === selectedPedido.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                          {statusConfig[selectedPedido.status].nextLabel}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">Atualiza o status e abre o WhatsApp com a mensagem pronta.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {selectedPedido.status !== 'ENTREGUE' && selectedPedido.status !== 'CANCELADO' && (
                        <Button variant="outline" className="w-full" onClick={() => setEditingPedido(selectedPedido)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                      )}
                      {selectedPedido.status !== 'FEITO' && selectedPedido.status !== 'CANCELADO' && (
                        <Button variant="outline" className="w-full" onClick={() => handleResendCurrentStatusMessage(selectedPedido)}>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Reenviar
                        </Button>
                      )}
                      {selectedPedido.statusPagamento !== 'APROVADO' && selectedPedido.status !== 'CANCELADO' && (
                        <Button variant="outline" className="w-full" onClick={() => handleConfirmPayment(selectedPedido.id)} disabled={confirmingPaymentId === selectedPedido.id}>
                          {confirmingPaymentId === selectedPedido.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                          Confirmar pag.
                        </Button>
                      )}
                      {selectedPedido.statusPagamento !== 'APROVADO' && (
                        <Button variant="outline" className="w-full" onClick={() => handleSendPaymentReminder(selectedPedido)} disabled={!getPedidoWhatsapp(selectedPedido)}>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Cobrar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Mover pedido</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2">
                    {kanbanColumns
                      .filter((column) => column.status !== selectedPedido.status)
                      .map((column) => (
                        <Button
                          key={column.status}
                          type="button"
                          variant="outline"
                          onClick={() => handleUpdateStatus(selectedPedido, column.status)}
                          disabled={updatingStatus === selectedPedido.id}
                        >
                          {column.title}
                        </Button>
                      ))}
                  </CardContent>
                </Card>
                {selectedPedido.status !== 'CANCELADO' && (
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Pagamento</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Ajustar status do pagamento</p>
                        <Select
                          value={selectedPedido.statusPagamento}
                          onValueChange={(value) => handleUpdatePaymentStatus(selectedPedido.id, value as Pedido['statusPagamento'])}
                        >
                          <SelectTrigger className="w-full bg-background" disabled={confirmingPaymentId === selectedPedido.id}>
                            <SelectValue />
                          </SelectTrigger>
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
                    </CardContent>
                  </Card>
                )}
                {selectedPedido.status !== 'ENTREGUE' && selectedPedido.status !== 'CANCELADO' && (
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><X className="h-4 w-4" />Cancelamento</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea placeholder="Informe o motivo do cancelamento" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} /><Button variant="destructive" className="w-full" onClick={() => handleCancelPedido(selectedPedido.id)} disabled={isCancelling || !cancelReason.trim()}>{isCancelling ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}Cancelar Pedido</Button></CardContent></Card>
                )}
                {(selectedPedido.statusPagamento !== 'APROVADO' || selectedPedido.status === 'CANCELADO') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive" className="w-full">Excluir Pedido</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Excluir pedido definitivamente?</AlertDialogTitle><AlertDialogDescription>Esta acao remove o pedido da base e nao e possivel desfazer. Pedidos pagos so podem ser excluidos quando estao cancelados.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel><X className="h-4 w-4 mr-0 md:mr-2" /><span className="hidden md:inline">Voltar</span></AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePedido(selectedPedido.id)} disabled={deletingPedidoId === selectedPedido.id}>{deletingPedidoId === selectedPedido.id ? <RefreshCw className="h-4 w-4 mr-0 md:mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-0 md:mr-2" />}<span className="hidden md:inline">{deletingPedidoId === selectedPedido.id ? 'Excluindo...' : 'Excluir'}</span></AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Itens</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {selectedPedido.itens.map(item => <div key={item.id} className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.quantidade}x {item.nomeProdutoSnapshot}</span><span className="shrink-0 font-medium">{formatarMoeda(item.totalItem)}</span></div>)}
                    <Separator />
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatarMoeda(selectedPedido.subtotal)}</span></div>
                    {selectedPedido.frete > 0 && <div className="flex justify-between text-sm"><span>Frete</span><span>{formatarMoeda(selectedPedido.frete)}</span></div>}
                    {selectedPedido.descontoValor && selectedPedido.descontoValor > 0 && <div className="flex justify-between text-sm text-success"><span>{selectedPedido.cupomCodigoSnapshot ? 'Desconto' : 'Valor promocional'}</span><span>-{formatarMoeda(selectedPedido.descontoValor)}</span></div>}
                    {selectedPedido.cupomCodigoSnapshot && <div className="flex justify-between text-sm"><span>Cupom</span><span>{selectedPedido.cupomCodigoSnapshot}</span></div>}
                    <div className="flex justify-between font-bold pt-2"><span>Total</span><span className="text-primary">{formatarMoeda(selectedPedido.total)}</span></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Atendimento</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2 text-sm"><User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words">{selectedPedido.clienteNome}</span></div>
                    <div className="flex items-start gap-2 text-sm"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{selectedPedido.clienteTelefone ? <a href={`tel:${selectedPedido.clienteTelefone}`} className="break-all text-primary hover:underline">{formatarTelefone(selectedPedido.clienteTelefone)}</a> : <span className="text-muted-foreground">Nao informado</span>}</div>
                    <div className="flex items-start gap-2 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>Pedido feito em {formatDateTimeInSaoPaulo(selectedPedido.criadoEm)}</span></div>
                    <div className="flex items-start gap-2 text-sm"><CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{getPagamentoLabel(selectedPedido.pagamento, selectedPedido.tipoCartao)}</span></div>
                    {selectedPedido.responsavelPedido && <div className="flex items-start gap-2 text-sm"><User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words">Responsavel: {selectedPedido.responsavelPedido}</span></div>}
                    {selectedPedido.destinatariosPedido && <div className="flex items-start gap-2 text-sm"><Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words">Separar para: {selectedPedido.destinatariosPedido}</span></div>}
                    {selectedPedido.levadoEm && <div className="flex items-start gap-2 text-sm"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>Levado em {formatDateTimeInSaoPaulo(selectedPedido.levadoEm)}</span></div>}
                    <Separator />
                    <div className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-medium">{entregaLabels[selectedPedido.tipoEntrega]}</span></div>
                    {selectedPedido.tipoEntrega === 'RESERVA_PAULISTANO' && <><p className="text-sm">Bloco: {selectedPedido.clienteBloco || '-'}</p><p className="text-sm">Apartamento: {selectedPedido.clienteApartamento || '-'}</p></>}
                    {selectedPedido.tipoEntrega === 'RETIRADA' && <p className="break-words text-sm">{selectedPedido.enderecoRetirada}</p>}
                    {selectedPedido.tipoEntrega === 'ENCOMENDA' && <p className="text-sm">Entrega em {selectedPedido.encomendaPara ? formatDateTimeInSaoPaulo(selectedPedido.encomendaPara) : '-'}</p>}
                    {selectedPedido.observacoesPedido && <div className="rounded-lg border bg-muted/35 p-3 text-sm text-muted-foreground break-words">{selectedPedido.observacoesPedido}</div>}
                  </CardContent>
                </Card>

                {selectedPedido.status === 'CANCELADO' && <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><X className="h-4 w-4" />Pedido Cancelado</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Motivo: {selectedPedido.motivoCancelamento || 'Nao informado'}</p></CardContent></Card>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto overflow-x-hidden p-3 sm:max-w-none sm:p-6 lg:w-[min(calc(100vw-3rem),1120px)]">
          <DialogHeader>
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

      <Dialog open={!!editingPedido} onOpenChange={(open) => { if (!open) setEditingPedido(null) }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto overflow-x-hidden p-3 sm:max-w-none sm:p-6 lg:w-[min(calc(100vw-3rem),1120px)]">
          <DialogHeader>
            <DialogTitle>Editar pedido</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}

