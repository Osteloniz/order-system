import type { StatusPagamento, StatusPedido, TipoEntrega } from '@/lib/types'

export const OPEN_ORDER_STATUSES = ['FEITO', 'ACEITO', 'PREPARACAO', 'PRONTO_ENTREGA'] as const satisfies readonly StatusPedido[]
export const COMMON_RESERVED_ORDER_STATUSES = ['ACEITO', 'PREPARACAO', 'PRONTO_ENTREGA'] as const satisfies readonly StatusPedido[]
export const ENCOMENDA_RESERVED_ORDER_STATUSES = ['PREPARACAO', 'PRONTO_ENTREGA'] as const satisfies readonly StatusPedido[]

export function isStatusPedidoAberto(status: StatusPedido) {
  return status !== 'ENTREGUE' && status !== 'CANCELADO'
}

export function isStatusPedidoReservadoComum(status: StatusPedido) {
  return status === 'ACEITO' || status === 'PREPARACAO' || status === 'PRONTO_ENTREGA'
}

export function isStatusPedidoReservadoEncomenda(status: StatusPedido) {
  return status === 'PREPARACAO' || status === 'PRONTO_ENTREGA'
}

export function canUseReadyToDeliverStatus(statusPagamento: StatusPagamento) {
  return statusPagamento === 'APROVADO'
}

type PedidoStatusContext = Pick<{ status: StatusPedido; statusPagamento: StatusPagamento; tipoEntrega: TipoEntrega }, 'status' | 'statusPagamento' | 'tipoEntrega'>

export function shouldUsePreparacaoStage(pedido: Pick<PedidoStatusContext, 'tipoEntrega'>) {
  return pedido.tipoEntrega === 'ENCOMENDA'
}

export function getNextOperationalStatus(pedido: PedidoStatusContext) {
  if (pedido.status === 'FEITO') return 'ACEITO' as const
  if (pedido.status === 'ACEITO') {
    if (shouldUsePreparacaoStage(pedido)) return 'PREPARACAO' as const
    if (canUseReadyToDeliverStatus(pedido.statusPagamento)) return 'PRONTO_ENTREGA' as const
    return 'ENTREGUE' as const
  }
  if (pedido.status === 'PREPARACAO') {
    return canUseReadyToDeliverStatus(pedido.statusPagamento) ? 'PRONTO_ENTREGA' as const : 'ENTREGUE' as const
  }
  if (pedido.status === 'PRONTO_ENTREGA') return 'ENTREGUE' as const
  return null
}

export function getPreviousOperationalStatus(pedido: PedidoStatusContext) {
  if (pedido.status === 'ACEITO') return 'FEITO' as const
  if (pedido.status === 'PREPARACAO') return 'ACEITO' as const
  if (pedido.status === 'PRONTO_ENTREGA') {
    return shouldUsePreparacaoStage(pedido) ? 'PREPARACAO' as const : 'ACEITO' as const
  }
  if (pedido.status === 'ENTREGUE') {
    if (canUseReadyToDeliverStatus(pedido.statusPagamento)) return 'PRONTO_ENTREGA' as const
    return shouldUsePreparacaoStage(pedido) ? 'PREPARACAO' as const : 'ACEITO' as const
  }
  return null
}

export function resolveStatusAfterPaymentChange(
  currentStatus: StatusPedido,
  nextStatusPagamento: StatusPagamento,
  tipoEntrega: TipoEntrega,
) {
  if (currentStatus === 'CANCELADO' || currentStatus === 'ENTREGUE') return currentStatus

  if (tipoEntrega === 'ENCOMENDA') {
    if ((currentStatus === 'FEITO' || currentStatus === 'ACEITO') && canUseReadyToDeliverStatus(nextStatusPagamento)) {
      return 'PREPARACAO' as const
    }
    if (currentStatus === 'PRONTO_ENTREGA' && !canUseReadyToDeliverStatus(nextStatusPagamento)) {
      return 'PREPARACAO' as const
    }
    return currentStatus
  }

  if (
    canUseReadyToDeliverStatus(nextStatusPagamento) &&
    (currentStatus === 'FEITO' || currentStatus === 'ACEITO' || currentStatus === 'PREPARACAO')
  ) {
    return 'PRONTO_ENTREGA' as const
  }
  if (currentStatus === 'PRONTO_ENTREGA' && !canUseReadyToDeliverStatus(nextStatusPagamento)) {
    return 'ACEITO' as const
  }
  return currentStatus
}
