'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { 
  Clock, Check, ChefHat, Truck, RefreshCw, X, Trash2,
  MapPin, Phone, CreditCard, User, Package, ChevronRight
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

export function PedidosDashboard() {
  const [activeTab, setActiveTab] = useState<string>('todos')
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [deletingPedidoId, setDeletingPedidoId] = useState<string | null>(null)

  const { data: pedidos, isLoading } = useSWR<Pedido[]>(
    '/api/admin/pedidos',
    fetcher,
    { refreshInterval: 5000 }
  )

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

  const handleUpdateStatus = async (pedidoId: string, newStatus: StatusPedido) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-0 md:mr-2" />
          <span className="hidden md:inline">Atualizar</span>
        </Button>
      </div>

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
                  <span>Pedido #{selectedPedido.id.slice(-6).toUpperCase()}</span>
                  <Badge className={statusConfig[selectedPedido.status].color}>
                    {statusConfig[selectedPedido.status].label}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Status Action */}
                {statusConfig[selectedPedido.status].nextStatus && (
                  <Button
                    className="w-full"
                    onClick={() => handleUpdateStatus(
                      selectedPedido.id, 
                      statusConfig[selectedPedido.status].nextStatus!
                    )}
                    disabled={updatingStatus === selectedPedido.id}
                  >
                    {updatingStatus === selectedPedido.id ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {statusConfig[selectedPedido.status].nextLabel}
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
                        DistÃ¢ncia: {selectedPedido.distanciaKm.toFixed(2)} km
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Motivo e exclusao */}
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

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full">
                            Excluir Pedido
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir pedido cancelado?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acao remove o pedido definitivamente. Nao e possivel desfazer.
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
