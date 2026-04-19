import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getMercadoPagoPayment,
  mapMercadoPagoStatus,
  verifyMercadoPagoWebhookSignature,
} from '@/lib/mercado-pago'

export const runtime = 'nodejs'

function getPaymentIdFromWebhook(request: NextRequest, body: any) {
  const searchParams = request.nextUrl.searchParams
  const queryId = searchParams.get('data.id') || searchParams.get('id')
  const bodyId = body?.data?.id || body?.id
  return String(queryId || bodyId || '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const type = body?.type || body?.topic || request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic')
    const paymentId = getPaymentIdFromWebhook(request, body)

    if (type && !String(type).includes('payment')) {
      return NextResponse.json({ received: true, ignored: true })
    }

    if (!paymentId) {
      return NextResponse.json({ received: true, ignored: true })
    }

    if (!verifyMercadoPagoWebhookSignature(request.headers, paymentId)) {
      console.warn('[mercado-pago-webhook] Assinatura invalida')
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 })
    }

    const payment = await getMercadoPagoPayment(paymentId)
    const pedidoId = payment.external_reference

    if (!pedidoId) {
      console.warn('[mercado-pago-webhook] Pagamento sem external_reference:', paymentId)
      return NextResponse.json({ received: true, ignored: true })
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, total: true, pagamento: true },
    })

    if (!pedido) {
      console.warn('[mercado-pago-webhook] Pedido nao encontrado:', pedidoId)
      return NextResponse.json({ received: true, ignored: true })
    }

    const amountInCents = Math.round(Number(payment.transaction_amount || 0) * 100)
    if (amountInCents !== pedido.total) {
      console.warn('[mercado-pago-webhook] Valor divergente:', {
        pedidoId,
        esperado: pedido.total,
        recebido: amountInCents,
      })
      return NextResponse.json({ error: 'Valor divergente' }, { status: 400 })
    }

    const statusPagamento = mapMercadoPagoStatus(payment.status)

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        statusPagamento,
        mercadoPagoPaymentId: String(payment.id),
      },
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[mercado-pago-webhook] Erro:', error)
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}
