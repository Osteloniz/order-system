import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { appLogger } from '@/lib/app-logger'
import { getAppUrl } from '@/lib/app-url'
import type { TipoCartao, TipoPagamento } from '@/lib/types'

const MERCADO_PAGO_API_BASE_URL = 'https://api.mercadopago.com'
const MERCADO_PAGO_LOCAL_REUSE_DAYS = 30

export class MercadoPagoApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'MercadoPagoApiError'
    this.status = status
    this.body = body
  }
}

type MercadoPagoPreferenceItem = {
  id: string
  title: string
  quantity: number
  unit_price: number
  currency_id: 'BRL'
}

type MercadoPagoPreferenceResponse = {
  id: string
  init_point?: string
  sandbox_init_point?: string
}

type MercadoPagoPaymentResponse = {
  id: number
  status: string
  status_detail?: string | null
  external_reference?: string | null
  payment_method_id?: string | null
  payment_type_id?: string | null
  date_approved?: string | null
  date_last_updated?: string | null
  point_of_interaction?: {
    transaction_data?: {
      qr_code_base64?: string | null
      qr_code?: string | null
      ticket_url?: string | null
    } | null
  } | null
}

type MercadoPagoRequestInit = RequestInit & {
  cache?: RequestCache
}

export function isMercadoPagoConfigured() {
  return Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim())
}

export function getMercadoPagoAccessToken() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  if (!accessToken) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')
  }
  return accessToken
}

export function getMercadoPagoWebhookSecret() {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('MERCADO_PAGO_WEBHOOK_SECRET nao configurado')
  }
  return secret
}

export function getMercadoPagoWebhookUrl() {
  return `${getAppUrl()}/api/mercadopago/webhook`
}

function buildMercadoPagoPayerEmail(externalReference: string) {
  const hashedReference =
    createHash('sha1')
      .update(externalReference.trim().toLowerCase() || 'pedido')
      .digest('hex')
      .slice(0, 24) || 'pedido'

  try {
    const host = new URL(getAppUrl()).hostname.replace(/^www\./i, '').trim().toLowerCase()
    if (host && host.includes('.') && host !== 'localhost') {
      return `pedido-${hashedReference}@${host}`
    }
  } catch {
    // Fallback seguro logo abaixo.
  }

  return `pedido-${hashedReference}@example.com`
}

export function getMercadoPagoLocalReuseExpiryDate() {
  return new Date(Date.now() + MERCADO_PAGO_LOCAL_REUSE_DAYS * 24 * 60 * 60 * 1000)
}

export function isMercadoPagoApiError(error: unknown): error is MercadoPagoApiError {
  return error instanceof MercadoPagoApiError
}

async function mercadoPagoRequest<T>(path: string, init?: MercadoPagoRequestInit): Promise<T> {
  const response = await fetch(`${MERCADO_PAGO_API_BASE_URL}${path}`, {
    ...init,
    cache: init?.cache ?? 'no-store',
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new MercadoPagoApiError('Falha na API do Mercado Pago', response.status, body)
  }

  return response.json() as Promise<T>
}

function buildExcludedPaymentTypes(pagamento: Exclude<TipoPagamento, 'DINHEIRO'>, tipoCartao?: TipoCartao | null) {
  if (pagamento === 'PIX') {
    return ['credit_card', 'debit_card', 'ticket', 'atm', 'prepaid_card']
  }

  if (tipoCartao === 'DEBITO') {
    return ['credit_card', 'bank_transfer', 'ticket', 'atm', 'prepaid_card']
  }

  return ['debit_card', 'bank_transfer', 'ticket', 'atm', 'prepaid_card']
}

export async function createMercadoPagoPreference(input: {
  externalReference: string
  customerName?: string
  items: MercadoPagoPreferenceItem[]
  pagamento: Exclude<TipoPagamento, 'DINHEIRO'>
  tipoCartao?: TipoCartao | null
  successUrl: string
  failureUrl: string
  pendingUrl: string
  notificationUrl?: string
}) {
  appLogger.info('[mercado-pago] Criando preferencia para pedido %s', input.externalReference)

  const payload = {
    external_reference: input.externalReference,
    items: input.items,
    payer: input.customerName?.trim()
      ? { name: input.customerName.trim() }
      : undefined,
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    auto_return: 'approved',
    notification_url: input.notificationUrl?.trim() || undefined,
    payment_methods: {
      excluded_payment_types: buildExcludedPaymentTypes(input.pagamento, input.tipoCartao).map((id) => ({ id })),
    },
    metadata: {
      order_reference: input.externalReference,
      gateway: 'MERCADO_PAGO',
    },
  }

  const response = await mercadoPagoRequest<MercadoPagoPreferenceResponse>('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const checkoutUrl = response.init_point?.trim() || response.sandbox_init_point?.trim()
  if (!checkoutUrl) {
    throw new Error('Mercado Pago nao retornou link de pagamento.')
  }

  return {
    id: response.id,
    link: checkoutUrl,
  }
}

export async function createMercadoPagoPixPayment(input: {
  externalReference: string
  amountCents: number
  description: string
  customerName?: string
  notificationUrl?: string
}) {
  const response = await mercadoPagoRequest<MercadoPagoPaymentResponse>('/v1/payments', {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: Number((input.amountCents / 100).toFixed(2)),
      description: input.description,
      payment_method_id: 'pix',
      payer: {
        email: buildMercadoPagoPayerEmail(input.externalReference),
        first_name: input.customerName?.trim() || undefined,
      },
      external_reference: input.externalReference,
      notification_url: input.notificationUrl?.trim() || undefined,
    }),
  })

  const transactionData = response.point_of_interaction?.transaction_data
  const qrCode = transactionData?.qr_code?.trim() || null
  const qrCodeBase64 = transactionData?.qr_code_base64?.trim() || null
  const ticketUrl = transactionData?.ticket_url?.trim() || null

  if (!qrCode || !qrCodeBase64) {
    throw new Error('Mercado Pago nao retornou os dados do QR Code Pix.')
  }

  return {
    id: String(response.id),
    link: ticketUrl,
    qrCode,
    qrCodeBase64,
    status: response.status || null,
    statusDetail: response.status_detail || null,
  }
}

export async function retrieveMercadoPagoPayment(paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>(`/v1/payments/${encodeURIComponent(paymentId)}`)
}

function parseMercadoPagoSignature(signatureHeader: string) {
  const parts = signatureHeader
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  let timestamp = ''
  let signature = ''

  for (const part of parts) {
    if (part.startsWith('ts=')) {
      timestamp = part.slice(3).trim()
      continue
    }
    if (part.startsWith('v1=')) {
      signature = part.slice(3).trim().toLowerCase()
    }
  }

  return { timestamp, signature }
}

export function validateMercadoPagoWebhookSignature(input: {
  secret: string
  xSignature: string
  xRequestId?: string | null
  dataId?: string | null
}) {
  const { timestamp, signature } = parseMercadoPagoSignature(input.xSignature)
  if (!timestamp || !signature) return false

  const manifestParts = [
    input.dataId?.trim() ? `id:${input.dataId.trim()};` : '',
    input.xRequestId?.trim() ? `request-id:${input.xRequestId.trim()};` : '',
    `ts:${timestamp};`,
  ].filter(Boolean)

  const manifest = manifestParts.join('')
  const expected = createHmac('sha256', input.secret).update(manifest).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'))
  } catch {
    return false
  }
}
