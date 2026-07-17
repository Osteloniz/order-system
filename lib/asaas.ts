import { appLogger } from '@/lib/app-logger'

type AsaasBillingType = 'PIX' | 'CREDIT_CARD'

type CreateCheckoutItem = {
  externalReference: string
  name: string
  description?: string
  quantity: number
  value: number
}

type CreateCheckoutInput = {
  externalReference: string
  customerName?: string
  customerPhone?: string
  customerCpfCnpj?: string
  customerEmail?: string
  billingTypes: AsaasBillingType[]
  items: CreateCheckoutItem[]
  successUrl: string
  cancelUrl: string
  expiredUrl: string
  minutesToExpire?: number
}

type AsaasCheckoutResponse = {
  id: string
  link: string
  status?: string
  minutesToExpire?: number
}

type AsaasPaymentResponse = {
  id: string
  status?: string
  billingType?: string
  externalReference?: string
  invoiceUrl?: string
}

type AsaasPixQrCodeResponse = {
  encodedImage?: string
  payload?: string
  expirationDate?: string
}

type AsaasPixAddressKeyListResponse = {
  data?: Array<{
    id: string
    status?: string
  }>
}

class AsaasApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = 'AsaasApiError'
    this.status = status
    this.details = details
  }
}

function getAsaasBaseUrl() {
  const env = process.env.ASAAS_ENV?.trim().toLowerCase()
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}

export function isAsaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY?.trim())
}

function getAsaasApiKey() {
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ASAAS_API_KEY nao configurada')
  }
  return apiKey
}

export function getAsaasWebhookToken() {
  const token = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!token) {
    throw new Error('ASAAS_WEBHOOK_TOKEN nao configurado')
  }
  return token
}

export function getAsaasCheckoutExpiryMinutes() {
  const parsed = Number(process.env.ASAAS_CHECKOUT_EXPIRY_MINUTES || '60')
  if (!Number.isFinite(parsed)) return 60
  return Math.min(1440, Math.max(10, Math.floor(parsed)))
}

async function asaasRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getAsaasBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      access_token: getAsaasApiKey(),
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'errors' in data && Array.isArray(data.errors)
        ? data.errors
            .map((error: unknown) => {
              if (typeof error === 'object' && error && 'description' in error && typeof error.description === 'string') {
                return error.description
              }
              return null
            })
            .filter(Boolean)
            .join('; ') || 'Erro ao comunicar com o Asaas'
        : 'Erro ao comunicar com o Asaas'
    throw new AsaasApiError(message, response.status, data)
  }

  return data as T
}

export async function createAsaasCheckout(input: CreateCheckoutInput) {
  const customerData =
    input.customerName && input.customerPhone && input.customerCpfCnpj && input.customerEmail
      ? {
          name: input.customerName,
          phone: input.customerPhone,
          cpfCnpj: input.customerCpfCnpj,
          email: input.customerEmail,
        }
      : undefined

  const payload = {
    billingTypes: input.billingTypes,
    chargeTypes: ['DETACHED'],
    minutesToExpire: input.minutesToExpire ?? getAsaasCheckoutExpiryMinutes(),
    externalReference: input.externalReference,
    callback: {
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiredUrl: input.expiredUrl,
    },
    items: input.items,
    ...(customerData ? { customerData } : {}),
  }

  appLogger.info('[asaas] Criando checkout para pedido %s', input.externalReference)

  return asaasRequest<AsaasCheckoutResponse>('/checkouts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function retrieveAsaasPayment(paymentId: string) {
  return asaasRequest<AsaasPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`)
}

export async function retrieveAsaasPixQrCode(paymentId: string) {
  return asaasRequest<AsaasPixQrCodeResponse>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`)
}

export async function hasActiveAsaasPixKey() {
  if (!isAsaasConfigured()) {
    return false
  }

  try {
    const response = await asaasRequest<AsaasPixAddressKeyListResponse>('/pix/addressKeys?status=ACTIVE&limit=1')
    return Array.isArray(response.data) && response.data.length > 0
  } catch (error) {
    appLogger.warn('[asaas] Nao foi possivel verificar as chaves Pix ativas', error)
    return false
  }
}

export async function deleteAsaasPayment(paymentId: string) {
  return asaasRequest<{ deleted?: boolean }>(`/payments/${encodeURIComponent(paymentId)}`, {
    method: 'DELETE',
  })
}

export function formatAsaasAmountFromCents(valueInCents: number) {
  return Number((valueInCents / 100).toFixed(2))
}

export function normalizeAsaasPhone(phone: string) {
  return phone.replace(/\D/g, '')
}

export function isAsaasApiError(error: unknown): error is AsaasApiError {
  return error instanceof AsaasApiError
}
