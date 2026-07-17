'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, Package, MapPin, CreditCard, Clock, ArrowLeft, MessageCircle, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { formatarMoeda, formatarDataHora, formatarTelefone } from '@/lib/calc'
import { saveRecentOrder } from '@/lib/customer-session'
import { ORDER_ACCESS_HEADER } from '@/lib/public-order-access'
import { getPagamentoLabel, statusPagamentoLabelsLong } from '@/lib/order-display'
import { buildWhatsappUrl } from '@/lib/phone'
import type { PedidoPublico, StatusPedido } from '@/lib/types'

const fetcher = async ([url, accessToken]: [string, string]) => {
  const response = await fetch(url, {
    headers: accessToken ? { [ORDER_ACCESS_HEADER]: accessToken } : undefined,
  })
  if (!response.ok) {
    throw new Error('Pedido nao encontrado')
  }
  return response.json()
}

const statusConfig: Record<StatusPedido, { label: string; color: string }> = {
  FEITO: { label: 'Pedido Recebido', color: 'bg-warning text-warning-foreground' },
  ACEITO: { label: 'Aceito', color: 'bg-accent text-accent-foreground' },
  PREPARACAO: { label: 'Em Preparação', color: 'bg-primary text-primary-foreground' },
  PRONTO_ENTREGA: { label: 'Pronto para Entrega', color: 'bg-success/15 text-success-foreground' },
  ENTREGUE: { label: 'Entregue', color: 'bg-success text-success-foreground' },
  CANCELADO: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground' }
}

function getConfirmationStatusMessage(pedido: PedidoPublico) {
  if (pedido.status === 'FEITO') {
    return pedido.pagamento !== 'DINHEIRO' && pedido.statusPagamento === 'PENDENTE'
      ? 'Seu pedido ja entrou na fila da loja. Assim que o pagamento for concluido, seguimos com a liberacao.'
      : 'Seu pedido ja entrou na fila da loja e sera analisado em breve.'
  }
  if (pedido.status === 'ACEITO') {
    return pedido.tipoEntrega === 'ENCOMENDA'
      ? 'A loja ja conferiu sua encomenda e vai iniciar a producao conforme o pagamento e a agenda.'
      : 'A loja ja conferiu seu pedido. Agora falta apenas concluir o atendimento e a entrega ou retirada.'
  }
  if (pedido.status === 'PREPARACAO') {
    return pedido.tipoEntrega === 'ENCOMENDA'
      ? 'Sua encomenda esta sendo produzida agora.'
      : 'Seu pedido esta passando por uma etapa interna antes da liberacao.'
  }
  if (pedido.status === 'PRONTO_ENTREGA') {
    return pedido.tipoEntrega === 'ENCOMENDA'
      ? 'Pagamento confirmado e encomenda pronta. Falta apenas entregar ou retirar.'
      : 'Pagamento confirmado e pedido pronto. Falta apenas entregar ou retirar.'
  }
  if (pedido.status === 'ENTREGUE') {
    return 'Pedido finalizado com sucesso.'
  }
  return 'Esse pedido foi cancelado.'
}

interface ConfirmationPageProps {
  pedidoId: string
  accessToken?: string
}

export function ConfirmationPage({ pedidoId, accessToken }: ConfirmationPageProps) {
  const router = useRouter()
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRefreshingPayment, setIsRefreshingPayment] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [activeAccessToken, setActiveAccessToken] = useState(accessToken || '')
  const { data: pedido, isLoading, error, mutate } = useSWR<PedidoPublico>(
    [`/api/pedidos/${pedidoId}`, activeAccessToken],
    fetcher,
    { refreshInterval: 10000 } // Atualiza a cada 10s para ver mudanças de status
  )

  useEffect(() => {
    if (pedido) {
      if (activeAccessToken) {
        setActiveAccessToken('')
        router.replace(`/confirmacao/${pedidoId}`)
      }

      saveRecentOrder(pedido)
    }
  }, [activeAccessToken, pedido, pedidoId, router])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-destructive mb-4">Pedido não encontrado</h1>
        <Link href="/">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao menu
          </Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!pedido) return null

  const statusInfo = statusConfig[pedido.status]
  const statusMessage = getConfirmationStatusMessage(pedido)
  const canCancelOrder = pedido.status === 'FEITO' && pedido.statusPagamento !== 'APROVADO' && pedido.pagamento === 'DINHEIRO'
  const canContinuePayment =
    pedido.status !== 'CANCELADO' &&
    pedido.statusPagamento === 'PENDENTE' &&
    pedido.pagamento !== 'DINHEIRO' &&
    Boolean(pedido.pagamentoOnline?.checkoutUrl)

  const handleCancelOrder = async () => {
    setCancelError('')
    setIsCancelling(true)

    try {
      const response = await fetch(`/api/pedidos/${pedido.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(activeAccessToken ? { [ORDER_ACCESS_HEADER]: activeAccessToken } : {}),
        },
        body: JSON.stringify({ action: 'cancel' })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cancelar pedido')
      }

      await mutate(data, false)
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Erro ao cancelar pedido')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleContinuePayment = async (action: 'RESUME' | 'REFRESH_LINK') => {
    setPaymentError('')
    setIsRefreshingPayment(true)

    try {
      const response = await fetch(`/api/pedidos/${pedido.id}/pagamento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeAccessToken ? { [ORDER_ACCESS_HEADER]: activeAccessToken } : {}),
        },
        body: JSON.stringify({ action }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel retomar o pagamento')
      }

      await mutate()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Nao foi possivel retomar o pagamento')
    } finally {
      setIsRefreshingPayment(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Success Header */}
      <div className="bg-success/10 py-8">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Pedido Confirmado!
          </h1>
          <p className="text-muted-foreground">
            {statusMessage}
          </p>
          <div className="mt-4">
            <Badge className={`text-sm px-3 py-1 ${statusInfo.color}`}>
              {statusInfo.label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Número do Pedido */}
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Número do pedido</p>
            <p className="text-2xl font-mono font-bold text-primary mt-1">
              {pedido.id.slice(-8).toUpperCase()}
            </p>
            <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Clock className="h-4 w-4" />
              {formatarDataHora(pedido.criadoEm)}
            </p>
          </CardContent>
        </Card>

        {/* Itens do Pedido */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5" />
              Itens do Pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pedido.itens.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.quantidade}x {item.nomeProdutoSnapshot}
                </span>
                <span className="font-medium">
                  {formatarMoeda(item.totalItem)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatarMoeda(pedido.subtotal)}</span>
            </div>
            {pedido.frete > 0 && (
              <div className="flex justify-between text-sm">
                <span>Taxa de entrega</span>
                <span>{formatarMoeda(pedido.frete)}</span>
              </div>
            )}
            {pedido.descontoValor && pedido.descontoValor > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Desconto</span>
                <span>-{formatarMoeda(pedido.descontoValor)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2">
              <span>Total</span>
              <span className="text-primary">{formatarMoeda(pedido.total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Informações de Entrega */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {pedido.tipoEntrega === 'RESERVA_PAULISTANO'
                ? 'Entrega Reserva Paulistano'
                : pedido.tipoEntrega === 'ENCOMENDA'
                  ? 'Encomenda'
                  : 'Retirada'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pedido.tipoEntrega === 'RESERVA_PAULISTANO' ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bloco</span>
                  <span className="font-medium">{pedido.clienteBloco}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Apartamento</span>
                  <span className="font-medium">{pedido.clienteApartamento}</span>
                </div>
              </>
            ) : (
              <p className="text-sm">
                {pedido.enderecoRetirada}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dados do Cliente */}
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Nome</span>
              <span className="font-medium">{pedido.clienteNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Telefone</span>
              <span className="font-medium">{pedido.clienteTelefone ? formatarTelefone(pedido.clienteTelefone) : 'Nao informado'}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="font-medium flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                {getPagamentoLabel(pedido.pagamento, pedido.tipoCartao)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status do pagamento</span>
              <span className="font-medium">{statusPagamentoLabelsLong[pedido.statusPagamento]}</span>
            </div>
            {pedido.status === 'PRONTO_ENTREGA' && (
              <p className="text-sm text-muted-foreground">
                O pagamento ja foi confirmado e o pedido esta liberado para a etapa final de entrega ou retirada.
              </p>
            )}
            {pedido.status === 'PREPARACAO' && pedido.tipoEntrega === 'ENCOMENDA' && (
              <p className="text-sm text-muted-foreground">
                Como esta encomenda depende de producao, a loja ainda esta preparando antes de liberar.
              </p>
            )}
            {pedido.statusPagamento === 'PENDENTE' && pedido.pagamento !== 'DINHEIRO' && (
              <p className="text-sm text-muted-foreground">
                Seu pedido ja foi criado. Finalize o pagamento online para liberar a proxima etapa com mais rapidez.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          {canContinuePayment ? (
            <>
              <Button
                className="w-full h-12"
                onClick={() => void handleContinuePayment('RESUME')}
                disabled={isRefreshingPayment}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {isRefreshingPayment ? 'Abrindo pagamento...' : 'Pagar agora'}
              </Button>
              <Button
                variant="outline"
                className="w-full h-12"
                onClick={() => void handleContinuePayment('REFRESH_LINK')}
                disabled={isRefreshingPayment}
              >
                <Clock className="h-4 w-4 mr-2" />
                Gerar novo link de pagamento
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Se quiser trocar a forma de pagamento, fale com a loja para ela ajustar seu pedido com seguranca.
              </p>
              {paymentError ? (
                <p className="text-sm text-destructive text-center">{paymentError}</p>
              ) : null}
            </>
          ) : null}
          {canCancelOrder && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full h-12">
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar pedido
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Voce pode cancelar enquanto a loja ainda nao aceitou o pedido e o pagamento nao foi aprovado.
                      Depois de cancelar, a loja nao ira preparar este pedido.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancelOrder}
                      disabled={isCancelling}
                    >
                      {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {cancelError && (
                <p className="text-sm text-destructive text-center">{cancelError}</p>
              )}
            </>
          )}
          {pedido.clienteWhatsapp && (
            <Button 
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                const mensagem = `Olá! Gostaria de saber mais sobre o status do meu pedido #${pedido.id.slice(-8).toUpperCase()}. Obrigado!`
                const url = buildWhatsappUrl(pedido.clienteWhatsapp, mensagem)
                if (url) window.open(url, '_blank')
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Acompanhar Pedido
            </Button>
          )}
          <Link href="/menu" className="block">
            <Button variant="outline" className="w-full h-12 bg-transparent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Fazer novo pedido
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}








