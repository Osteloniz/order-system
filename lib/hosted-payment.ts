import { getAppUrl } from '@/lib/app-url'
import type { TipoPagamento } from '@/lib/types'

export type OnlinePaymentGateway = 'ASAAS' | 'MERCADO_PAGO'

type HostedPaymentSource = {
  pagamento: TipoPagamento
  asaasCheckoutUrl?: string | null
  asaasInvoiceUrl?: string | null
  asaasPixQrCode?: string | null
  asaasPixCopyPaste?: string | null
  asaasCheckoutExpiresAt?: Date | string | null
}

export function inferHostedCheckoutGateway(checkoutUrl?: string | null): OnlinePaymentGateway | null {
  const normalizedUrl = checkoutUrl?.trim().toLowerCase() || ''
  if (!normalizedUrl) return null

  if (normalizedUrl.includes('asaas')) {
    return 'ASAAS'
  }

  if (normalizedUrl.includes('mercadopago') || normalizedUrl.includes('mpago')) {
    return 'MERCADO_PAGO'
  }

  return null
}

export function getHostedGatewayLabel(gateway: OnlinePaymentGateway | null) {
  if (gateway === 'MERCADO_PAGO') return 'Mercado Pago'
  if (gateway === 'ASAAS') return 'Asaas'
  return 'Manual'
}

export function buildHostedReturnUrl(
  orderId: string,
  status: 'success' | 'cancel' | 'expired',
  returnToken: string,
  gateway: OnlinePaymentGateway,
) {
  const basePath = gateway === 'MERCADO_PAGO' ? 'mercado-pago' : 'asaas'
  return `${getAppUrl()}/pagamento/${basePath}/${encodeURIComponent(orderId)}?status=${status}&token=${encodeURIComponent(returnToken)}`
}

export function serializeHostedPagamentoOnline(pedido: HostedPaymentSource) {
  if (pedido.pagamento === 'DINHEIRO') return null

  const gateway =
    inferHostedCheckoutGateway(pedido.asaasCheckoutUrl) ||
    ((pedido.asaasPixQrCode || pedido.asaasPixCopyPaste) ? 'MERCADO_PAGO' : null)

  if (!gateway) return null

  return {
    gateway,
    checkoutUrl: pedido.asaasCheckoutUrl ?? null,
    invoiceUrl: gateway === 'ASAAS' ? pedido.asaasInvoiceUrl ?? null : null,
    pixQrCode: pedido.asaasPixQrCode ?? null,
    pixCopyPaste: pedido.asaasPixCopyPaste ?? null,
    expiresAt: pedido.asaasCheckoutExpiresAt ?? null,
  }
}
