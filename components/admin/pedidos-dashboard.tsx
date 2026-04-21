'use client'

import type { DragEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, BellRing, Check, ChefHat, Clock, CreditCard, GripVertical, MapPin, MessageCircle, Package, Phone, Plus, RefreshCw, Search, Trash2, Truck, User, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NovoPedidoAdminPage } from '@/components/admin/novo-pedido-page'
import { formatarMoeda, formatarHora, formatarTelefone } from '@/lib/calc'
import { getAdminAlertSoundEnabled, getAdminAlertsEnabled, getNotificationPermission, setAdminAlertsEnabled } from '@/lib/admin-alert-settings'
import { buildStatusMessage, hydrateConfigWithMessageDefaults } from '@/lib/message-templates'
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

const transicoesPermitidas: Record<StatusPedido, StatusPedido[]> = {
  FEITO: ['ACEITO'],
  ACEITO: ['PREPARACAO'],
  PREPARACAO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: []
}

const pagamentoLabels = { PIX: 'PIX', CARTAO: 'Cartao', DINHEIRO: 'Dinheiro' }
const entregaLabels = { RESERVA_PAULISTANO: 'Reserva', RETIRADA: 'Retirada', ENCOMENDA: 'Encomenda' }
const statusPagamentoLabels = { NAO_APLICAVEL: 'Na entrega', PENDENTE: 'Pendente', APROVADO: 'Aprovado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado', REEMBOLSADO: 'Reembolsado' }
const statusPagamentoColors = {
  NAO_APLICAVEL: 'bg-secondary text-secondary-foreground',
  PENDENTE: 'bg-warning text-warning-foreground',
  APROVADO: 'bg-success text-success-foreground',
  RECUSADO: 'bg-destructive text-destructive-foreground',
  CANCELADO: 'bg-destructive text-destructive-foreground',
  REEMBOLSADO: 'bg-accent text-accent-foreground'
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
  const telefone = getPedidoWhatsapp(pedido)
  const mensagem = buildStatusMessage(pedido, status, config)
  if (!telefone || !mensagem) return
  window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer')
}

function canMovePedido(pedido: Pedido, targetStatus: StatusPedido) {
  if (pedido.status === targetStatus) return false
  return transicoesPermitidas[pedido.status].includes(targetStatus)
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function PedidosDashboard() {
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [deletingPedidoId, setDeletingPedidoId] = useState<string | null>(null)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)
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
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const seenPedidoIdsRef = useRef<Set<string>>(new Set())
  const initialPedidosLoadedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  const pedidosUrl = `/api/admin/pedidos?date=${dateFilter}&carryoverNovos=1`
  const { data: pedidos, isLoading } = useSWR<Pedido[]>(pedidosUrl, fetcher, { refreshInterval: 5000 })
  const { data: rawConfig } = useSWR<Configuracao>('/api/admin/config', fetcher)
  const config = hydrateConfigWithMessageDefaults(rawConfig)

  const contadores = {
    novos: pedidos?.filter(p => p.status === 'FEITO').length || 0,
    aceitos: pedidos?.filter(p => p.status === 'ACEITO').length || 0,
    preparando: pedidos?.filter(p => p.status === 'PREPARACAO').length || 0,
    entregues: pedidos?.filter(p => p.status === 'ENTREGUE').length || 0,
    cancelados: pedidos?.filter(p => p.status === 'CANCELADO').length || 0,
    todos: pedidos?.length || 0
  }

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
      pedido.mercadoPagoPaymentId,
      pedido.mercadoPagoPreferenceId,
      pedido.itens.map(item => item.nomeProdutoSnapshot).join(' '),
    ].filter(Boolean).join(' ').toLowerCase()

    if (busca && !textoBusca.includes(busca)) return false
    if (statusFilter !== 'TODOS' && pedido.status !== statusFilter) return false
    if (paymentFilter !== 'TODOS' && pedido.pagamento !== paymentFilter) return false
    if (paymentStatusFilter !== 'TODOS' && pedido.statusPagamento !== paymentStatusFilter) return false

    return true
  })

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    statusFilter !== 'TODOS' ||
    paymentFilter !== 'TODOS' ||
    paymentStatusFilter !== 'TODOS' ||
    dateFilter !== todayInSaoPaulo()
  )

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
      const response = await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const pedidoAtualizado = await response.json()
      if (!response.ok) {
        setLastAlertMessage(pedidoAtualizado.error || 'Nao foi possivel atualizar o status.')
        return
      }
      await mutate(pedidosUrl)
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/admin/producao'))
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
      if (config?.envioAutomaticoWhatsappStatus) {
        abrirWhatsappStatus(pedido, newStatus, config)
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
      const response = await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELADO', motivoCancelamento: cancelReason })
      })
      const pedidoAtualizado = await response.json()
      if (!response.ok) {
        setLastAlertMessage(pedidoAtualizado.error || 'Nao foi possivel cancelar o pedido.')
        return
      }
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
    setConfirmingPaymentId(pedidoId)
    try {
      const response = await fetch(`/api/admin/pedidos/${pedidoId}/pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusPagamento: 'APROVADO' })
      })
      if (!response.ok) return
      const pedidoAtualizado = await response.json()
      mutate(pedidosUrl)
      if (selectedPedido?.id === pedidoId) setSelectedPedido(pedidoAtualizado)
    } finally {
      setConfirmingPaymentId(null)
    }
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

    return (
      <Card
        key={pedido.id}
        draggable={pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO'}
        onDragStart={(event) => {
          setDraggedPedidoId(pedido.id)
          event.dataTransfer.setData('text/plain', pedido.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDraggedPedidoId(null)}
        className={`cursor-pointer border-border/70 bg-card/95 transition-all hover:-translate-y-0.5 hover:shadow-md ${draggedPedidoId === pedido.id ? 'opacity-50' : ''}`}
        onClick={() => { setSelectedPedido(pedido); setCancelReason('') }}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
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
          <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{formatarHora(pedido.criadoEm)}</span><span className="font-bold text-primary">{formatarMoeda(pedido.total)}</span></div>
          {isUpdating && <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" />Atualizando status...</div>}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Arraste os cards para avancar: Novo &gt; Aceito &gt; Em preparo &gt; Entregue.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setNewOrderOpen(true)}>
            <Plus className="h-4 w-4 mr-0 md:mr-2" />
            <span className="hidden md:inline">Novo pedido</span>
          </Button>
          {alertsEnabled && !soundUnlocked && (
            <Button variant="outline" size="sm" onClick={handleUnlockSound}>
              <Volume2 className="h-4 w-4 mr-0 md:mr-2" />
              <span className="hidden md:inline">Ativar som</span>
            </Button>
          )}
          <Button variant={alertsEnabled ? 'default' : 'outline'} size="sm" onClick={alertsEnabled ? handleDisableAlerts : handleEnableAlerts}>
            {alertsEnabled ? <BellRing className="h-4 w-4 mr-0 md:mr-2" /> : <Bell className="h-4 w-4 mr-0 md:mr-2" />}
            <span className="hidden md:inline">{alertsEnabled ? 'Alertas ativos' : 'Ativar alertas'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}><RefreshCw className="h-4 w-4 mr-0 md:mr-2" /><span className="hidden md:inline">Atualizar</span></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Novos</p><p className="text-2xl font-bold">{contadores.novos}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Aceitos</p><p className="text-2xl font-bold">{contadores.aceitos}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Em preparo</p><p className="text-2xl font-bold">{contadores.preparando}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Entregues</p><p className="text-2xl font-bold">{contadores.entregues}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{contadores.todos}</p></CardContent></Card>
      </div>

      <Card className="border-primary/15 bg-card/90">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Buscar pedido</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Numero, nome, telefone, bloco, item ou ID Mercado Pago"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusPedido | 'TODOS')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="TODOS">Todos</option>
                  <option value="FEITO">Novos</option>
                  <option value="ACEITO">Aceitos</option>
                  <option value="PREPARACAO">Em preparo</option>
                  <option value="ENTREGUE">Entregues</option>
                  <option value="CANCELADO">Cancelados</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Pagamento</label>
                <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as 'TODOS' | Pedido['pagamento'])} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="TODOS">Todos</option>
                  <option value="PIX">PIX</option>
                  <option value="CARTAO">Cartao</option>
                  <option value="DINHEIRO">Dinheiro</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status pag.</label>
                <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value as 'TODOS' | Pedido['statusPagamento'])} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="TODOS">Todos</option>
                  <option value="NAO_APLICAVEL">Na entrega</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="RECUSADO">Recusado</option>
                  <option value="CANCELADO">Cancelado</option>
                  <option value="REEMBOLSADO">Reembolsado</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Dia da tela</label>
                <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Exibindo {pedidosFiltrados.length} de {pedidos?.length || 0} pedidos.
            </span>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {lastAlertMessage && (
        <Card className={alertsEnabled ? 'border-primary/40 bg-primary/5' : 'border-muted'}>
          <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="flex items-center gap-2">{alertsEnabled ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4 text-muted-foreground" />}<span>{lastAlertMessage}</span></div>
            {notificationPermission === 'denied' && <span className="text-xs text-muted-foreground">Permissao do navegador bloqueada</span>}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-5">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-96 w-full" />)}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {kanbanColumns.map(column => {
            const columnPedidos = pedidosFiltrados.filter(pedido => pedido.status === column.status)
            const StatusIcon = statusConfig[column.status].icon
            return (
              <div key={column.status} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => handleDrop(event, column.status)} className={`min-h-[360px] rounded-2xl border p-3 ${statusConfig[column.status].columnClass}`}>
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
      )}

      <Sheet open={!!selectedPedido} onOpenChange={() => { setSelectedPedido(null); setCancelReason('') }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPedido && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between"><span>Pedido #{selectedPedido.id.slice(-8).toUpperCase()}</span><Badge className={statusConfig[selectedPedido.status].color}>{statusConfig[selectedPedido.status].label}</Badge></SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {statusConfig[selectedPedido.status].nextStatus && (
                  <div className="space-y-2"><Button className="w-full" onClick={() => handleUpdateStatus(selectedPedido, statusConfig[selectedPedido.status].nextStatus!)} disabled={updatingStatus === selectedPedido.id}>{updatingStatus === selectedPedido.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}{statusConfig[selectedPedido.status].nextLabel}</Button><p className="text-xs text-muted-foreground text-center">Atualiza o status e abre o WhatsApp com a mensagem pronta.</p></div>
                )}
                {selectedPedido.status !== 'FEITO' && selectedPedido.status !== 'CANCELADO' && (
                  <Button variant="outline" className="w-full" onClick={() => handleResendCurrentStatusMessage(selectedPedido)}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Reenviar mensagem do status atual
                  </Button>
                )}
                {selectedPedido.status !== 'CANCELADO' && selectedPedido.statusPagamento !== 'APROVADO' && <Button variant="outline" className="w-full" onClick={() => handleConfirmPayment(selectedPedido.id)} disabled={confirmingPaymentId === selectedPedido.id}>{confirmingPaymentId === selectedPedido.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}Confirmar pagamento manualmente</Button>}
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
                    {selectedPedido.itens.map(item => <div key={item.id} className="flex justify-between text-sm"><span>{item.quantidade}x {item.nomeProdutoSnapshot}</span><span className="font-medium">{formatarMoeda(item.totalItem)}</span></div>)}
                    <Separator />
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatarMoeda(selectedPedido.subtotal)}</span></div>
                    {selectedPedido.frete > 0 && <div className="flex justify-between text-sm"><span>Frete</span><span>{formatarMoeda(selectedPedido.frete)}</span></div>}
                    {selectedPedido.descontoValor && selectedPedido.descontoValor > 0 && <div className="flex justify-between text-sm text-success"><span>Desconto</span><span>-{formatarMoeda(selectedPedido.descontoValor)}</span></div>}
                    {selectedPedido.cupomCodigoSnapshot && <div className="flex justify-between text-sm"><span>Cupom</span><span>{selectedPedido.cupomCodigoSnapshot}</span></div>}
                    <div className="flex justify-between font-bold pt-2"><span>Total</span><span className="text-primary">{formatarMoeda(selectedPedido.total)}</span></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Cliente</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span>{selectedPedido.clienteNome}</span></div>
                    <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${selectedPedido.clienteTelefone}`} className="text-primary hover:underline">{formatarTelefone(selectedPedido.clienteTelefone)}</a></div>
                    <div className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4 text-muted-foreground" /><span>{pagamentoLabels[selectedPedido.pagamento]}</span></div>
                    <div className="flex items-center gap-2 text-sm"><Badge className={statusPagamentoColors[selectedPedido.statusPagamento]}>{statusPagamentoLabels[selectedPedido.statusPagamento]}</Badge>{selectedPedido.mercadoPagoPaymentId && <span className="font-mono text-xs text-muted-foreground">MP {selectedPedido.mercadoPagoPaymentId}</span>}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />{entregaLabels[selectedPedido.tipoEntrega]}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {selectedPedido.tipoEntrega === 'RESERVA_PAULISTANO' && <><p className="text-sm">Bloco: {selectedPedido.clienteBloco || '-'}</p><p className="text-sm">Apartamento: {selectedPedido.clienteApartamento || '-'}</p></>}
                    {selectedPedido.tipoEntrega === 'RETIRADA' && <p className="text-sm">{selectedPedido.enderecoRetirada}</p>}
                    {selectedPedido.tipoEntrega === 'ENCOMENDA' && <p className="text-sm">Entrega em {selectedPedido.encomendaPara ? new Date(selectedPedido.encomendaPara).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '-'}</p>}
                  </CardContent>
                </Card>

                {selectedPedido.status === 'CANCELADO' && <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><X className="h-4 w-4" />Pedido Cancelado</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Motivo: {selectedPedido.motivoCancelamento || 'Nao informado'}</p></CardContent></Card>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden p-4 sm:max-w-none sm:p-6 lg:w-[min(calc(100vw-3rem),1120px)]">
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
    </div>
  )
}

