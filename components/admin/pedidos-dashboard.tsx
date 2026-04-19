'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { 
  Clock, Check, ChefHat, Truck, RefreshCw, X, Trash2,
  MapPin, Phone, CreditCard, User, Package, ChevronRight, Bell, BellRing
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatarMoeda, formatarHora, formatarTelefone } from '@/lib/calc'
import type { Pedido, StatusPedido } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const statusConfig: Record<StatusPedido, { 
  label: string
  color: string 
  icon: typeof Clock
  nextStatus?: StatusPedido
  nextLabel?: string
}> = {
  FEITO: { 
    label: 'Novo', 
    color: 'bg-warning text-warning-foreground',
    icon: Clock,
    nextStatus: 'ACEITO',
    nextLabel: 'Aceitar Pedido'
  },
  ACEITO: { 
    label: 'Aceito', 
    color: 'bg-accent text-accent-foreground',
    icon: Check,
    nextStatus: 'PREPARACAO',
    nextLabel: 'Iniciar Preparo'
  },
  PREPARACAO: { 
    label: 'Preparando', 
    color: 'bg-primary text-primary-foreground',
    icon: ChefHat,
    nextStatus: 'ENTREGUE',
    nextLabel: 'Marcar Entregue'
  },
  ENTREGUE: { 
    label: 'Entregue', 
    color: 'bg-success text-success-foreground',
    icon: Truck
  },
  CANCELADO: {
    label: 'Cancelado',
    color: 'bg-destructive text-destructive-foreground',
    icon: X
  }
}

const pagamentoLabels = {
  PIX: 'PIX',
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro'
}

const statusPagamentoLabels = {
  NAO_APLICAVEL: 'Na entrega',
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado',
  REEMBOLSADO: 'Reembolsado'
}

const statusPagamentoColors = {
  NAO_APLICAVEL: 'bg-secondary text-secondary-foreground',
  PENDENTE: 'bg-warning text-warning-foreground',
  APROVADO: 'bg-success text-success-foreground',
  RECUSADO: 'bg-destructive text-destructive-foreground',
  CANCELADO: 'bg-destructive text-destructive-foreground',
  REEMBOLSADO: 'bg-accent text-accent-foreground'
}

const ADMIN_ALERTS_STORAGE_KEY = 'brookie-admin-alertas-pedidos'

function getPedidoWhatsapp(pedido: Pedido) {
  return (pedido.clienteWhatsapp || pedido.clienteTelefone || '').replace(/\D/g, '')
}

function formatarListaItens(pedido: Pedido) {
  return pedido.itens
    .map(item => `- ${item.quantidade}x ${item.nomeProdutoSnapshot}`)
    .join('\n')
}

function criarMensagemStatus(pedido: Pedido, status: StatusPedido) {
  const listaItens = formatarListaItens(pedido)
  const total = formatarMoeda(pedido.total)
  const formaPagamento = pagamentoLabels[pedido.pagamento]

  if (status === 'ACEITO') {
    return [
      'O seu pedido foi aceito ✅',
      '',
      'Resumo do pedido:',
      listaItens,
      '',
      `Total = ${total}`,
      '',
      `Pagamento: ${formaPagamento}`,
    ].join('\n')
  }

  if (status === 'PREPARACAO') {
    return [
      'Seu pedido está em preparo 👨‍🍳',
      pedido.statusPagamento === 'APROVADO' ? 'Pagamento confirmado.' : 'Estamos aguardando pagamento.',
      '',
      'Resumo do pedido:',
      listaItens,
      '',
      `Total = ${total}`,
    ].join('\n')
  }

  if (status === 'ENTREGUE') {
    return [
      'Seu pedido foi entregue 🚚',
      '',
      'Resumo do pedido:',
      listaItens,
      '',
      `Total = ${total}`,
      '',
      'Obrigado pela preferência! 💙',
    ].join('\n')
  }

  return ''
}

function abrirWhatsappStatus(pedido: Pedido, status: StatusPedido) {
  const telefone = getPedidoWhatsapp(pedido)
  const mensagem = criarMensagemStatus(pedido, status)

  if (!telefone || !mensagem) return

  window.open(
    `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`,
    '_blank',
    'noopener,noreferrer'
  )
}

function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return Notification.permission
}

export function PedidosDashboard() {
  const [activeTab, setActiveTab] = useState<string>('todos')
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [deletingPedidoId, setDeletingPedidoId] = useState<string | null>(null)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission)
  const [lastAlertMessage, setLastAlertMessage] = useState<string | null>(null)
  const seenPedidoIdsRef = useRef<Set<string>>(new Set())
  const initialPedidosLoadedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  const { data: pedidos, isLoading } = useSWR<Pedido[]>(
    '/api/admin/pedidos',
    fetcher,
    { refreshInterval: 5000 }
  )

  const unlockAlertSound = async () => {
    if (audioContextRef.current) {
      await audioContextRef.current.resume()
      return
    }

    const AudioContextConstructor = window.AudioContext || (window as typeof window & {
      webkitAudioContext: typeof AudioContext
    }).webkitAudioContext
    audioContextRef.current = new AudioContextConstructor()
    await audioContextRef.current.resume()
  }

  const playAlertSound = () => {
    const audioContext = audioContextRef.current
    if (!audioContext) return

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.18)
    gain.gain.setValueAtTime(0.001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.42)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.45)
  }

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(ADMIN_ALERTS_STORAGE_KEY)

    if (savedPreference === 'enabled' && getNotificationPermission() !== 'denied') {
      setAlertsEnabled(true)
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

    const novosPedidos = pedidos.filter(pedido => {
      return pedido.status === 'FEITO' && !seenPedidoIdsRef.current.has(pedido.id)
    })

    pedidos.forEach(pedido => seenPedidoIdsRef.current.add(pedido.id))

    if (novosPedidos.length === 0 || !alertsEnabled) return

    const message = novosPedidos.length === 1
      ? `Novo pedido de ${novosPedidos[0].clienteNome}`
      : `${novosPedidos.length} novos pedidos aguardando aceite`

    setLastAlertMessage(message)
    playAlertSound()

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Brookie Pregiato', {
        body: message,
        icon: '/favicon.ico',
        tag: 'novo-pedido'
      })

      notification.onclick = () => {
        window.focus()
        setActiveTab('novos')
        notification.close()
      }
    }
  }, [alertsEnabled, pedidos])

  const handleEnableAlerts = async () => {
    await unlockAlertSound()

    let permission = getNotificationPermission()
    if ('Notification' in window && Notification.permission === 'default') {
      permission = await Notification.requestPermission()
    }

    setNotificationPermission(permission)

    if (permission === 'denied') {
      setLastAlertMessage('Notificacoes bloqueadas no navegador. O som interno continua ativo.')
    } else {
      setLastAlertMessage('Alertas ativados para novos pedidos.')
    }

    setAlertsEnabled(true)
    window.localStorage.setItem(ADMIN_ALERTS_STORAGE_KEY, 'enabled')
  }

  const handleDisableAlerts = () => {
    setAlertsEnabled(false)
    window.localStorage.setItem(ADMIN_ALERTS_STORAGE_KEY, 'disabled')
    setLastAlertMessage('Alertas pausados.')
  }

  const filteredPedidos = pedidos?.filter(p => {
    if (activeTab === 'todos') return true
    if (activeTab === 'novos') return p.status === 'FEITO'
    if (activeTab === 'preparando') return p.status === 'ACEITO' || p.status === 'PREPARACAO'
    if (activeTab === 'entregues') return p.status === 'ENTREGUE'
    if (activeTab === 'cancelados') return p.status === 'CANCELADO'
    return true
  }) || []

  const contadores = {
    novos: pedidos?.filter(p => p.status === 'FEITO').length || 0,
    preparando: pedidos?.filter(p => p.status === 'ACEITO' || p.status === 'PREPARACAO').length || 0,
    entregues: pedidos?.filter(p => p.status === 'ENTREGUE').length || 0,
    cancelados: pedidos?.filter(p => p.status === 'CANCELADO').length || 0,
    todos: pedidos?.length || 0
  }

  const handleUpdateStatus = async (pedido: Pedido, newStatus: StatusPedido) => {
    const pedidoId = pedido.id
    setUpdatingStatus(pedidoId)
    try {
      await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      mutate('/api/admin/pedidos')
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido(prev => prev ? { ...prev, status: newStatus } : null)
      }
      abrirWhatsappStatus(pedido, newStatus)
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleRefresh = () => {
    mutate('/api/admin/pedidos')
  }

  const handleCancelPedido = async (pedidoId: string) => {
    if (!cancelReason.trim()) return
    setIsCancelling(true)
    try {
      await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELADO', motivoCancelamento: cancelReason })
      })
      mutate('/api/admin/pedidos')
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido(prev => prev ? { 
          ...prev, 
          status: 'CANCELADO', 
          motivoCancelamento: cancelReason.trim() 
        } : null)
      }
      setCancelReason('')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDeletePedido = async (pedidoId: string) => {
    setDeletingPedidoId(pedidoId)
    try {
      await fetch(`/api/admin/pedidos/${pedidoId}`, {
        method: 'DELETE'
      })
      mutate('/api/admin/pedidos')
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido(null)
      }
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
      mutate('/api/admin/pedidos')
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido(pedidoAtualizado)
      }
    } finally {
      setConfirmingPaymentId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={alertsEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={alertsEnabled ? handleDisableAlerts : handleEnableAlerts}
          >
            {alertsEnabled ? (
              <BellRing className="h-4 w-4 mr-0 md:mr-2" />
            ) : (
              <Bell className="h-4 w-4 mr-0 md:mr-2" />
            )}
            <span className="hidden md:inline">
              {alertsEnabled ? 'Alertas ativos' : 'Ativar alertas'}
            </span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-0 md:mr-2" />
            <span className="hidden md:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {lastAlertMessage && (
        <Card className={alertsEnabled ? 'border-primary/40 bg-primary/5' : 'border-muted'}>
          <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="flex items-center gap-2">
              {alertsEnabled ? (
                <BellRing className="h-4 w-4 text-primary" />
              ) : (
                <Bell className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{lastAlertMessage}</span>
            </div>
            {notificationPermission === 'denied' && (
              <span className="text-xs text-muted-foreground">
                Permissao do navegador bloqueada
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="novos" className="relative">
            <span className="md:hidden inline-flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </span>
            <span className="hidden md:inline">Novos</span>
            {contadores.novos > 0 && (
              <Badge className="ml-2 bg-warning text-warning-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                {contadores.novos}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preparando">
            <span className="md:hidden inline-flex items-center justify-center">
              <ChefHat className="h-4 w-4" />
            </span>
            <span className="hidden md:inline">Em Preparo</span>
            {contadores.preparando > 0 && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {contadores.preparando}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="entregues">
            <span className="md:hidden inline-flex items-center justify-center">
              <Truck className="h-4 w-4" />
            </span>
            <span className="hidden md:inline">Entregues</span>
          </TabsTrigger>
          <TabsTrigger value="cancelados">
            <span className="md:hidden inline-flex items-center justify-center">
              <X className="h-4 w-4" />
            </span>
            <span className="hidden md:inline">Cancelados</span>
            {contadores.cancelados > 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                {contadores.cancelados}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="todos">
            <span className="md:hidden inline-flex items-center justify-center">
              <Package className="h-4 w-4" />
            </span>
            <span className="hidden md:inline">Todos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredPedidos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum pedido encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPedidos.map(pedido => {
                const status = statusConfig[pedido.status]
                const StatusIcon = status.icon
                
                return (
                  <Card 
                    key={pedido.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setSelectedPedido(pedido)
                      setCancelReason('')
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`p-2 rounded-full ${status.color}`}>
                            <StatusIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold truncate">{pedido.clienteNome}</span>
                              <Badge variant="outline" className="text-xs">
                                {pedido.tipoEntrega === 'ENTREGA' ? 'Entrega' : 'Retirada'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatarHora(pedido.criadoEm)}
                              </span>
                              <span className="font-medium text-foreground">
                                {formatarMoeda(pedido.total)}
                              </span>
                              <Badge className={statusPagamentoColors[pedido.statusPagamento]}>
                                {statusPagamentoLabels[pedido.statusPagamento]}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selectedPedido} onOpenChange={() => {
        setSelectedPedido(null)
        setCancelReason('')
      }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPedido && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between">
                  <span>Pedido #{selectedPedido.id.slice(-8).toUpperCase()}</span>
                  <Badge className={statusConfig[selectedPedido.status].color}>
                    {statusConfig[selectedPedido.status].label}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Status Action */}
                {statusConfig[selectedPedido.status].nextStatus && (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => handleUpdateStatus(
                        selectedPedido,
                        statusConfig[selectedPedido.status].nextStatus!
                      )}
                      disabled={updatingStatus === selectedPedido.id}
                    >
                      {updatingStatus === selectedPedido.id ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      {statusConfig[selectedPedido.status].nextLabel}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Atualiza o status e abre o WhatsApp com a mensagem pronta.
                    </p>
                  </div>
                )}

                {/* Cancelar pedido */}
                {selectedPedido.status !== 'CANCELADO' && selectedPedido.statusPagamento !== 'APROVADO' && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConfirmPayment(selectedPedido.id)}
                    disabled={confirmingPaymentId === selectedPedido.id}
                  >
                    {confirmingPaymentId === selectedPedido.id ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Confirmar pagamento manualmente
                  </Button>
                )}

                {/* Cancelar pedido */}
                {selectedPedido.status !== 'ENTREGUE' && selectedPedido.status !== 'CANCELADO' && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <X className="h-4 w-4" />
                        Cancelamento
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        placeholder="Informe o motivo do cancelamento"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={3}
                      />
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => handleCancelPedido(selectedPedido.id)}
                        disabled={isCancelling || !cancelReason.trim()}
                      >
                        {isCancelling ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Cancelar Pedido
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Exclusao permitida apenas para pedidos sem pagamento confirmado */}
                {selectedPedido.statusPagamento !== 'APROVADO' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        Excluir Pedido
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir pedido definitivamente?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acao remove o pedido da base e nao e possivel desfazer.
                          Pedidos marcados como pagos nao podem ser excluidos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          <X className="h-4 w-4 mr-0 md:mr-2" />
                          <span className="hidden md:inline">Voltar</span>
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeletePedido(selectedPedido.id)}
                          disabled={deletingPedidoId === selectedPedido.id}
                        >
                          {deletingPedidoId === selectedPedido.id ? (
                            <RefreshCw className="h-4 w-4 mr-0 md:mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-0 md:mr-2" />
                          )}
                          <span className="hidden md:inline">
                            {deletingPedidoId === selectedPedido.id ? 'Excluindo...' : 'Excluir'}
                          </span>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Itens */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Itens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedPedido.itens.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.quantidade}x {item.nomeProdutoSnapshot}</span>
                        <span className="font-medium">{formatarMoeda(item.totalItem)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>{formatarMoeda(selectedPedido.subtotal)}</span>
                    </div>
                    {selectedPedido.frete > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Frete</span>
                        <span>{formatarMoeda(selectedPedido.frete)}</span>
                      </div>
                    )}
                    {selectedPedido.descontoValor && selectedPedido.descontoValor > 0 && (
                      <div className="flex justify-between text-sm text-success">
                        <span>Desconto</span>
                        <span>-{formatarMoeda(selectedPedido.descontoValor)}</span>
                      </div>
                    )}
                    {selectedPedido.cupomCodigoSnapshot && (
                      <div className="flex justify-between text-sm">
                        <span>Cupom</span>
                        <span>{selectedPedido.cupomCodigoSnapshot}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-2">
                      <span>Total</span>
                      <span className="text-primary">{formatarMoeda(selectedPedido.total)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Cliente */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedPedido.clienteNome}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={`tel:${selectedPedido.clienteTelefone}`}
                        className="text-primary hover:underline"
                      >
                        {formatarTelefone(selectedPedido.clienteTelefone)}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>{pagamentoLabels[selectedPedido.pagamento]}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge className={statusPagamentoColors[selectedPedido.statusPagamento]}>
                        {statusPagamentoLabels[selectedPedido.statusPagamento]}
                      </Badge>
                      {selectedPedido.mercadoPagoPaymentId && (
                        <span className="font-mono text-xs text-muted-foreground">
                          MP {selectedPedido.mercadoPagoPaymentId}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Entrega */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedPedido.tipoEntrega === 'ENTREGA' ? 'Entregar em' : 'Retirada em'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {selectedPedido.tipoEntrega === 'ENTREGA'
                        ? selectedPedido.enderecoEntrega
                        : selectedPedido.enderecoRetirada}
                    </p>
                    {selectedPedido.tipoEntrega === 'ENTREGA' && selectedPedido.distanciaKm && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Distância: {selectedPedido.distanciaKm.toFixed(2)} km
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Motivo */}
                {selectedPedido.status === 'CANCELADO' && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <X className="h-4 w-4" />
                        Pedido Cancelado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Motivo: {selectedPedido.motivoCancelamento || 'Nao informado'}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}



