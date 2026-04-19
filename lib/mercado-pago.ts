import type { Pedido, ItemPedido } from '@prisma/client'
import { createHmac, timingSafeEqual } from 'crypto'

type PedidoComItens = Pedido & { itens: ItemPedido[] }

type PreferenceResponse = {
  id: string
  init_point?: string
  sandbox_init_point?: string
}

export type MercadoPagoPayment = {
  id: number
  status: string
  status_detail?: string
  external_reference?: string
  transaction_amount?: number
  currency_id?: string
  payment_method_id?: string
  payment_type_id?: string
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

function getExcludedPaymentTypes(pagamento: Pedido['pagamento']) {
  if (pagamento === 'PIX') {
    return [
      { id: 'credit_card' },
      { id: 'debit_card' },
      { id: 'ticket' },
      { id: 'atm' },
    ]
  }

  if (pagamento === 'CARTAO') {
    return [
      { id: 'ticket' },
      { id: 'atm' },
      { id: 'bank_transfer' },
    ]
  }

  return []
}

export async function createMercadoPagoPreference(pedido: PedidoComItens) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')
  }

  if (pedido.pagamento !== 'PIX' && pedido.pagamento !== 'CARTAO') {
    throw new Error('Forma de pagamento nao usa Mercado Pago')
  }

  const baseUrl = getBaseUrl()
  const shortOrderId = pedido.id.slice(-8).toUpperCase()

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: pedido.itens.map((item) => ({
        id: item.produtoId,
        title: item.nomeProdutoSnapshot,
        quantity: item.quantidade,
        unit_price: item.precoUnitarioSnapshot / 100,
        currency_id: 'BRL',
      })),
      payer: {
        name: pedido.clienteNome,
      },
      external_reference: pedido.id,
      notification_url: `${baseUrl}/api/webhooks/mercado-pago`,
      statement_descriptor: 'BROOKIE PREGIATO',
      back_urls: {
        success: `${baseUrl}/confirmacao/${pedido.id}?mp_status=success`,
        pending: `${baseUrl}/confirmacao/${pedido.id}?mp_status=pending`,
        failure: `${baseUrl}/confirmacao/${pedido.id}?mp_status=failure`,
      },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: getExcludedPaymentTypes(pedido.pagamento),
        installments: 3,
      },
      metadata: {
        pedido_id: pedido.id,
        pedido_numero: shortOrderId,
      },
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('[mercado-pago] Erro ao criar preferencia:', data)
    throw new Error('Erro ao criar pagamento no Mercado Pago')
  }

  const preference = data as PreferenceResponse
  const checkoutUrl = preference.init_point || preference.sandbox_init_point
  if (!checkoutUrl) {
    throw new Error('Mercado Pago nao retornou URL de checkout')
  }

  return {
    preferenceId: preference.id,
    checkoutUrl,
  }
}

export async function getMercadoPagoPayment(paymentId: string) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('[mercado-pago] Erro ao consultar pagamento:', data)
    throw new Error('Erro ao consultar pagamento no Mercado Pago')
  }

  return data as MercadoPagoPayment
}

export function mapMercadoPagoStatus(status: string) {
  if (status === 'approved' || status === 'authorized') return 'APROVADO'
  if (status === 'rejected') return 'RECUSADO'
  if (status === 'cancelled') return 'CANCELADO'
  if (status === 'refunded' || status === 'charged_back') return 'REEMBOLSADO'
  return 'PENDENTE'
}

export function verifyMercadoPagoWebhookSignature(headers: Headers, dataId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) return true

  const signature = headers.get('x-signature')
  const requestId = headers.get('x-request-id')
  if (!signature || !requestId || !dataId) return false

  const parts = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, value] = part.split('=')
      return [key?.trim(), value?.trim()]
    })
  )

  const timestamp = parts.ts
  const receivedSignature = parts.v1
  if (!timestamp || !receivedSignature) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`
  const expectedSignature = createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  const received = Buffer.from(receivedSignature, 'hex')
  const expected = Buffer.from(expectedSignature, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}
