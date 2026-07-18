import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncOrderStockForTransition } from '@/lib/order-stock'
import {
  getMercadoPagoWebhookSecret,
  retrieveMercadoPagoPayment,
  validateMercadoPagoWebhookSignature,
} from '@/lib/mercado-pago'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { hashAsaasReturnToken } from '@/lib/public-order-access'
import { resolveStatusAfterPaymentChange } from '@/lib/order-status'

export const runtime = 'nodejs'

type MercadoPagoWebhookPayload = {
  id?: string | number
  action?: string
  type?: string
  data?: {
    id?: string | number
  }
}

function mapMercadoPagoStatusToPaymentStatus(status?: string | null) {
  switch ((status || '').trim().toLowerCase()) {
    case 'approved':
      return 'APROVADO' as const
    case 'refunded':
    case 'charged_back':
      return 'REEMBOLSADO' as const
    case 'rejected':
      return 'RECUSADO' as const
    case 'cancelled':
      return 'CANCELADO' as const
    default:
      return 'PENDENTE' as const
  }
}

function resolveNextStatusPagamento(
  current: string,
  next: ReturnType<typeof mapMercadoPagoStatusToPaymentStatus>,
) {
  if (current === 'REEMBOLSADO') return 'REEMBOLSADO'
  if (current === 'CANCELADO' && next !== 'REEMBOLSADO') return 'CANCELADO'
  if (current === 'APROVADO' && (next === 'PENDENTE' || next === 'RECUSADO')) return 'APROVADO'
  return next
}

function parseExternalReference(externalReference?: string | null) {
  const normalized = externalReference?.trim() || ''
  if (!normalized) {
    return { pedidoId: null, returnToken: null }
  }

  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex <= 0) {
    return { pedidoId: normalized, returnToken: null }
  }

  return {
    pedidoId: normalized.slice(0, separatorIndex),
    returnToken: normalized.slice(separatorIndex + 1) || null,
  }
}

export async function POST(request: NextRequest) {
  let webhookSecret = ''

  try {
    webhookSecret = getMercadoPagoWebhookSecret()
  } catch {
    return NextResponse.json({ error: 'Webhook indisponivel' }, { status: 503 })
  }

  const body = await request.json().catch(() => null as MercadoPagoWebhookPayload | null)
  if (!body || body.type !== 'payment') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const dataId = request.nextUrl.searchParams.get('data.id')?.trim() || String(body.data?.id ?? '').trim()
  const xSignature = request.headers.get('x-signature')?.trim() || ''
  const xRequestId = request.headers.get('x-request-id')?.trim() || ''

  if (!xSignature || !dataId) {
    return NextResponse.json({ error: 'Webhook invalido' }, { status: 400 })
  }

  const isValidSignature = validateMercadoPagoWebhookSignature({
    secret: webhookSecret,
    xSignature,
    xRequestId,
    dataId,
  })

  if (!isValidSignature) {
    return NextResponse.json({ error: 'Webhook nao autorizado' }, { status: 401 })
  }

  const payment = await retrieveMercadoPagoPayment(dataId)
  const externalReference = payment.external_reference?.trim() || null
  const { pedidoId, returnToken } = parseExternalReference(externalReference)

  if (!pedidoId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { itens: true },
  })

  if (!pedido) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  if (!returnToken || !pedido.asaasReturnTokenHash || hashAsaasReturnToken(returnToken) !== pedido.asaasReturnTokenHash) {
    return NextResponse.json({ ok: true, stale: true })
  }

  const notificationId = String(body.id ?? '').trim() || `payment:${payment.id}:${payment.status}`
  if (pedido.asaasLastEventId === notificationId) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const mappedStatus = mapMercadoPagoStatusToPaymentStatus(payment.status)
  const statusPagamento = resolveNextStatusPagamento(pedido.statusPagamento, mappedStatus)
  const nextStatus = resolveStatusAfterPaymentChange(pedido.status, statusPagamento, pedido.tipoEntrega)

  await prisma.$transaction(async (tx) => {
    const estoqueControle = pedido.tenantId
      ? await syncOrderStockForTransition({
          tx,
          tenantId: pedido.tenantId,
          pedidoAtual: pedido,
          targetStatus: nextStatus,
          targetStatusPagamento: statusPagamento,
          actorNome: 'Mercado Pago webhook',
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
        asaasPaymentId: String(payment.id),
        asaasPaymentStatus: payment.status || body.action || 'payment.updated',
        asaasLastEventId: notificationId,
        asaasLastSyncAt: new Date(),
      },
    })

    if (nextStatus !== pedido.status && pedido.tenantId) {
      await registrarLogOperacao(tx, {
        tenantId: pedido.tenantId,
        tipo: 'PEDIDO_STATUS_ALTERADO',
        descricao: `Status do pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} ajustado de ${pedido.status} para ${nextStatus} pelo webhook do Mercado Pago.`,
        actorNome: 'Mercado Pago webhook',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id) ?? pedido.id,
        metadata: {
          origem: 'MERCADO_PAGO_WEBHOOK',
          notificationId,
          action: body.action ?? null,
          paymentId: String(payment.id),
          paymentStatus: payment.status ?? null,
          statusAnterior: pedido.status,
          statusNovo: nextStatus,
          statusPagamento,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
