'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { CheckCircle, Package, MapPin, CreditCard, Clock, ArrowLeft, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarDataHora, formatarTelefone } from '@/lib/calc'
import { saveRecentOrder } from '@/lib/customer-session'
import type { Pedido, StatusPedido } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const statusConfig: Record<StatusPedido, { label: string; color: string }> = {
  FEITO: { label: 'Pedido Recebido', color: 'bg-warning text-warning-foreground' },
  ACEITO: { label: 'Aceito', color: 'bg-accent text-accent-foreground' },
  PREPARACAO: { label: 'Em Preparação', color: 'bg-primary text-primary-foreground' },
  ENTREGUE: { label: 'Entregue', color: 'bg-success text-success-foreground' },
  CANCELADO: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground' }
}

const pagamentoLabels = {
  PIX: 'PIX',
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro'
}

const statusPagamentoLabels = {
  NAO_APLICAVEL: 'Pagamento na entrega',
  PENDENTE: 'Pagamento pendente',
  APROVADO: 'Pagamento aprovado',
  RECUSADO: 'Pagamento recusado',
  CANCELADO: 'Pagamento cancelado',
  REEMBOLSADO: 'Pagamento reembolsado'
}

interface ConfirmationPageProps {
  pedidoId: string
}

export function ConfirmationPage({ pedidoId }: ConfirmationPageProps) {
  const [isPaying, setIsPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const { data: pedido, isLoading, error } = useSWR<Pedido>(
    `/api/pedidos/${pedidoId}`,
    fetcher,
    { refreshInterval: 10000 } // Atualiza a cada 10s para ver mudanças de status
  )

  useEffect(() => {
    if (pedido) {
      saveRecentOrder(pedido)
    }
  }, [pedido])

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
  const shouldShowPaymentButton = pedido.status === 'FEITO' && (pedido.pagamento === 'PIX' || pedido.pagamento === 'CARTAO')

  const handlePayNow = async () => {
    setPaymentError('')
    setIsPaying(true)

    try {
      const response = await fetch('/api/pagamentos/mercado-pago/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: pedido.id })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao iniciar pagamento')
      }

      window.location.href = data.checkoutUrl
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Erro ao iniciar pagamento')
      setIsPaying(false)
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
            Seu pedido foi enviado com sucesso
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
              {pedido.tipoEntrega === 'RESERVA_PAULISTANO' ? 'Entrega Reserva Paulistano' : 'Retirada'}
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
              <span className="font-medium">{formatarTelefone(pedido.clienteTelefone)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="font-medium flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                {pagamentoLabels[pedido.pagamento]}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status do pagamento</span>
              <span className="font-medium">{statusPagamentoLabels[pedido.statusPagamento]}</span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          {shouldShowPaymentButton && (
            <>
              <Button className="w-full h-12" onClick={handlePayNow} disabled={isPaying}>
                <CreditCard className="h-4 w-4 mr-2" />
                {isPaying ? 'Abrindo pagamento...' : `Pagar agora com ${pagamentoLabels[pedido.pagamento]}`}
              </Button>
              {paymentError && (
                <p className="text-sm text-destructive text-center">{paymentError}</p>
              )}
            </>
          )}
          {pedido.clienteWhatsapp && (
            <Button 
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                const mensagem = `Olá! Gostaria de saber mais sobre o status do meu pedido #${pedido.id.slice(-8).toUpperCase()}. Obrigado!`
                const mensagemCodificada = encodeURIComponent(mensagem)
                const url = `https://wa.me/55${pedido.clienteWhatsapp}?text=${mensagemCodificada}`
                window.open(url, '_blank')
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Acompanhar Pedido
            </Button>
          )}
          <Link href="/" className="block">
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








