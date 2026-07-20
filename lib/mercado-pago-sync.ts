import { prisma } from '@/lib/db'
import { inferHostedCheckoutGateway } from '@/lib/hosted-payment'
import { retrieveMercadoPagoPayment } from '@/lib/mercado-pago'
import { syncOrderStockForTransition } from '@/lib/order-stock'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { hashAsaasReturnToken } from '@/lib/public-order-access'
import { resolveStatusAfterPaymentChange } from '@/lib/order-status'

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

export type PendingMercadoPagoPixSyncCandidate = {
  status: string
  statusPagamento: string
  pagamento: string
  asaasPaymentId?: string | null
  asaasCheckoutUrl?: string | null
  asaasPixQrCode?: string | null
  asaasPixCopyPaste?: string | null
  asaasLastSyncAt?: Date | string | null
}

export function shouldSyncPendingMercadoPagoPix(
  pedido: PendingMercadoPagoPixSyncCandidate,
  minIntervalMs = 15000,
  now = new Date(),
) {
  if (pedido.status === 'CANCELADO') return false
  if (pedido.statusPagamento !== 'PENDENTE') return false
  if (pedido.pagamento !== 'PIX') return false

  const paymentId = pedido.asaasPaymentId?.trim()
  if (!paymentId) return false

  const gateway =
    inferHostedCheckoutGateway(pedido.asaasCheckoutUrl) ||
    ((pedido.asaasPixQrCode || pedido.asaasPixCopyPaste) ? 'MERCADO_PAGO' : null)
  if (gateway !== 'MERCADO_PAGO') return false

  if (!pedido.asaasLastSyncAt) return true

  const lastSyncAt = new Date(pedido.asaasLastSyncAt)
  if (Number.isNaN(lastSyncAt.getTime())) return true

  return now.getTime() - lastSyncAt.getTime() >= minIntervalMs
}

export function buildMercadoPagoPollNotificationId(
  paymentId: string,
  now = Date.now(),
  bucketMs = 15000,
) {
  return `poll:${paymentId}:${Math.floor(now / bucketMs)}`
}

export async function syncMercadoPagoPaymentById(input: {
  paymentId: string
  notificationId: string
  origin: 'WEBHOOK' | 'RETURN' | 'POLL'
}) {
  const payment = await retrieveMercadoPagoPayment(input.paymentId)
  const externalReference = payment.external_reference?.trim() || null
  const { pedidoId, returnToken } = parseExternalReference(externalReference)

  if (!pedidoId) {
    return { ok: false as const, reason: 'missing-order-reference' }
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { itens: true },
  })

  if (!pedido) {
    return { ok: false as const, reason: 'order-not-found' }
  }

  if (!returnToken || !pedido.asaasReturnTokenHash || hashAsaasReturnToken(returnToken) !== pedido.asaasReturnTokenHash) {
    return { ok: false as const, reason: 'stale-return-token', pedidoId }
  }

  if (pedido.asaasLastEventId === input.notificationId) {
    return { ok: true as const, duplicate: true, pedidoId: pedido.id }
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
          actorNome:
            input.origin === 'WEBHOOK'
              ? 'Mercado Pago webhook'
              : input.origin === 'RETURN'
                ? 'Retorno Mercado Pago'
                : 'Consulta Mercado Pago',
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
        asaasPaymentStatus: payment.status || 'payment.updated',
        asaasLastEventId: input.notificationId,
        asaasLastSyncAt: new Date(),
      },
    })

    if ((nextStatus !== pedido.status || statusPagamento !== pedido.statusPagamento) && pedido.tenantId) {
      await registrarLogOperacao(tx, {
        tenantId: pedido.tenantId,
        tipo: 'PEDIDO_STATUS_ALTERADO',
        descricao:
          input.origin === 'WEBHOOK'
            ? `Status do pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} ajustado de ${pedido.status} para ${nextStatus} pelo webhook do Mercado Pago.`
            : input.origin === 'RETURN'
              ? `Pagamento do pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} sincronizado no retorno do Mercado Pago.`
              : `Pagamento do pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} sincronizado por consulta ativa ao Mercado Pago.`,
        actorNome:
          input.origin === 'WEBHOOK'
            ? 'Mercado Pago webhook'
            : input.origin === 'RETURN'
              ? 'Retorno Mercado Pago'
              : 'Consulta Mercado Pago',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id) ?? pedido.id,
        metadata: {
          origem:
            input.origin === 'WEBHOOK'
              ? 'MERCADO_PAGO_WEBHOOK'
              : input.origin === 'RETURN'
                ? 'MERCADO_PAGO_RETURN'
                : 'MERCADO_PAGO_POLL',
          notificationId: input.notificationId,
          paymentId: String(payment.id),
          paymentStatus: payment.status ?? null,
          statusAnterior: pedido.status,
          statusNovo: nextStatus,
          statusPagamentoAnterior: pedido.statusPagamento,
          statusPagamentoNovo: statusPagamento,
        },
      })
    }
  })

  return {
    ok: true as const,
    pedidoId: pedido.id,
    statusPagamento,
    nextStatus,
    duplicate: false,
  }
}
