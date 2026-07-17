import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAsaasWebhookToken, retrieveAsaasPayment, retrieveAsaasPixQrCode } from '@/lib/asaas'
import { safeEqualString } from '@/lib/auth-security'
import { prisma } from '@/lib/db'
import { syncOrderStockForTransition } from '@/lib/order-stock'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { resolveStatusAfterPaymentChange } from '@/lib/order-status'

export const runtime = 'nodejs'

const webhookSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  payment: z.object({
    id: z.string().min(1),
  }).optional(),
}).passthrough()

function mapAsaasEventToPaymentStatus(event: string) {
  if (
    event === 'PAYMENT_CONFIRMED' ||
    event === 'PAYMENT_RECEIVED' ||
    event === 'PAYMENT_AUTHORIZED' ||
    event === 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'
  ) {
    return 'APROVADO' as const
  }

  if (
    event === 'PAYMENT_REFUNDED' ||
    event === 'PAYMENT_PARTIALLY_REFUNDED' ||
    event === 'PAYMENT_RECEIVED_IN_CASH_UNDONE'
  ) {
    return 'REEMBOLSADO' as const
  }

  if (
    event === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' ||
    event === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' ||
    event === 'PAYMENT_CHARGEBACK_REQUESTED'
  ) {
    return 'RECUSADO' as const
  }

  if (
    event === 'PAYMENT_DELETED' ||
    event === 'PAYMENT_BANK_SLIP_CANCELLED'
  ) {
    return 'CANCELADO' as const
  }

  return 'PENDENTE' as const
}

function resolveNextStatusPagamento(current: string, next: ReturnType<typeof mapAsaasEventToPaymentStatus>) {
  if (current === 'REEMBOLSADO') return 'REEMBOLSADO'
  if (current === 'CANCELADO' && next !== 'REEMBOLSADO') return 'CANCELADO'
  if (current === 'APROVADO' && (next === 'PENDENTE' || next === 'RECUSADO')) return 'APROVADO'
  return next
}

export async function POST(request: NextRequest) {
  const headerToken = request.headers.get('asaas-access-token')?.trim() || ''

  try {
    const expectedToken = getAsaasWebhookToken()
    if (!headerToken || !safeEqualString(headerToken, expectedToken)) {
      return NextResponse.json({ error: 'Webhook nao autorizado' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Webhook indisponivel' }, { status: 503 })
  }

  const body = await request.json()
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload invalido' }, { status: 400 })
  }

  const eventId = parsed.data.id
  const paymentId = parsed.data.payment?.id || null
  const existingEvent = await prisma.asaasWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true },
  })

  if (existingEvent) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  let payment: Awaited<ReturnType<typeof retrieveAsaasPayment>> | null = null
  let pixData: Awaited<ReturnType<typeof retrieveAsaasPixQrCode>> | null = null

  if (paymentId) {
    payment = await retrieveAsaasPayment(paymentId)
    if (payment.billingType === 'PIX') {
      try {
        pixData = await retrieveAsaasPixQrCode(paymentId)
      } catch {
        pixData = null
      }
    }
  }

  const externalReference = payment?.externalReference?.trim() || null
  const pedido = externalReference
    ? await prisma.pedido.findUnique({
        where: { id: externalReference },
        include: { itens: true },
      })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.asaasWebhookEvent.create({
      data: {
        id: eventId,
        event: parsed.data.event,
        paymentId,
        externalReference,
        payload: body,
        pedidoId: pedido?.id ?? null,
        tenantId: pedido?.tenantId ?? null,
      },
    })

    if (!pedido) return

    const mappedStatus = mapAsaasEventToPaymentStatus(parsed.data.event)
    const statusPagamento = resolveNextStatusPagamento(pedido.statusPagamento, mappedStatus)
    const nextStatus = resolveStatusAfterPaymentChange(pedido.status, statusPagamento, pedido.tipoEntrega)
    const estoqueControle = pedido.tenantId
      ? await syncOrderStockForTransition({
          tx,
          tenantId: pedido.tenantId,
          pedidoAtual: pedido,
          targetStatus: nextStatus,
          targetStatusPagamento: statusPagamento,
          actorNome: 'Asaas webhook',
          pedidoNumero: numeroPedidoCurto(pedido.id) ?? pedido.id,
        })
      : {
          estoqueReservadoEm: pedido.estoqueReservadoEm,
          estoqueBaixadoEm: pedido.estoqueBaixadoEm,
        }

    await tx.pedido.update({
      where: { id: pedido.id },
      data: {
        status: nextStatus,
        statusPagamento,
        estoqueReservadoEm: estoqueControle.estoqueReservadoEm,
        estoqueBaixadoEm: estoqueControle.estoqueBaixadoEm,
        asaasPaymentId: payment?.id ?? paymentId,
        asaasInvoiceUrl: payment?.invoiceUrl ?? null,
        asaasPixQrCode: pixData?.encodedImage ?? null,
        asaasPixCopyPaste: pixData?.payload ?? null,
        asaasPaymentStatus: payment?.status ?? parsed.data.event,
        asaasLastEventId: eventId,
        asaasLastSyncAt: new Date(),
      },
    })

    if (nextStatus !== pedido.status && pedido.tenantId) {
      await registrarLogOperacao(tx, {
        tenantId: pedido.tenantId,
        tipo: 'PEDIDO_STATUS_ALTERADO',
        descricao: `Status do pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} ajustado de ${pedido.status} para ${nextStatus} pelo webhook do Asaas.`,
        actorNome: 'Asaas webhook',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id) ?? pedido.id,
        metadata: {
          origem: 'ASAAS_WEBHOOK',
          eventId,
          event: parsed.data.event,
          statusAnterior: pedido.status,
          statusNovo: nextStatus,
          statusPagamento,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
