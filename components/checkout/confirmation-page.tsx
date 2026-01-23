'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { CheckCircle, Package, MapPin, CreditCard, Clock, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda, formatarDataHora, formatarTelefone } from '@/lib/calc'
import type { Pedido, StatusPedido } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const statusConfig: Record<StatusPedido, { label: string; color: string }> = {
  FEITO: { label: 'Pedido Recebido', color: 'bg-warning text-warning-foreground' },
  ACEITO: { label: 'Aceito', color: 'bg-accent text-accent-foreground' },
  PREPARACAO: { label: 'Em Preparação', color: 'bg-primary text-primary-foreground' },
  ENTREGUE: { label: 'Entregue', color: 'bg-success text-success-foreground' }
}

const pagamentoLabels = {
  PIX: 'PIX',
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro'
}

interface ConfirmationPageProps {
  pedidoId: string
}

export function ConfirmationPage({ pedidoId }: ConfirmationPageProps) {
  const { data: pedido, isLoading, error } = useSWR<Pedido>(
    `/api/pedidos/${pedidoId}`,
    fetcher,
    { refreshInterval: 10000 } // Atualiza a cada 10s para ver mudanças de status
  )

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
              {pedido.id.toUpperCase()}
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
              {pedido.tipoEntrega === 'ENTREGA' ? 'Entrega' : 'Retirada'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {pedido.tipoEntrega === 'ENTREGA' 
                ? pedido.enderecoEntrega 
                : pedido.enderecoRetirada}
            </p>
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
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
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
