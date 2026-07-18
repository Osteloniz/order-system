import 'server-only'

import { createHmac } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getTokenPepper, safeEqualString } from '@/lib/auth-security'

const PUBLIC_CUSTOMER_ACCESS_COOKIE_NAME = 'brookie.customer-access'
const PUBLIC_CUSTOMER_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type PublicCustomerAccessPayload = {
  tenantId: string
  phone: string
  exp: number
}

type PedidoPublicCustomerContact = {
  clienteTelefone?: string | null
  clienteWhatsapp?: string | null
}

function normalizePhoneContact(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function getPublicCustomerAccessSecret() {
  return (
    process.env.NEXTAUTH_SECRET?.trim() ||
    getTokenPepper() ||
    'brookie-public-customer-access'
  )
}

function signPublicCustomerAccessPayload(encodedPayload: string) {
  return createHmac('sha256', getPublicCustomerAccessSecret())
    .update(encodedPayload)
    .digest('hex')
}

function encodePublicCustomerAccessPayload(payload: PublicCustomerAccessPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePublicCustomerAccessPayload(encodedPayload: string) {
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PublicCustomerAccessPayload
  } catch {
    return null
  }
}

export function createPublicCustomerAccessToken(input: {
  tenantId: string
  phone: string
  expiresAt?: Date
}) {
  const normalizedPhone = normalizePhoneContact(input.phone)
  if (!normalizedPhone) return ''

  const expiresAt = input.expiresAt ?? new Date(Date.now() + PUBLIC_CUSTOMER_ACCESS_MAX_AGE_SECONDS * 1000)
  const payload = encodePublicCustomerAccessPayload({
    tenantId: input.tenantId,
    phone: normalizedPhone,
    exp: expiresAt.getTime(),
  })

  return `${payload}.${signPublicCustomerAccessPayload(payload)}`
}

export function setPublicCustomerAccessCookie(response: NextResponse, tenantId: string, phone?: string | null) {
  const normalizedPhone = normalizePhoneContact(phone)
  if (!normalizedPhone) return

  response.cookies.set({
    name: PUBLIC_CUSTOMER_ACCESS_COOKIE_NAME,
    value: createPublicCustomerAccessToken({ tenantId, phone: normalizedPhone }),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PUBLIC_CUSTOMER_ACCESS_MAX_AGE_SECONDS,
  })
}

export function clearPublicCustomerAccessCookie(response: NextResponse) {
  response.cookies.set({
    name: PUBLIC_CUSTOMER_ACCESS_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export function getPublicCustomerAccessPhone(request: NextRequest, tenantId: string) {
  const rawToken = request.cookies.get(PUBLIC_CUSTOMER_ACCESS_COOKIE_NAME)?.value?.trim() || ''
  if (!rawToken) return ''

  const [encodedPayload, signature] = rawToken.split('.', 2)
  if (!encodedPayload || !signature) return ''

  const expectedSignature = signPublicCustomerAccessPayload(encodedPayload)
  if (!safeEqualString(signature, expectedSignature)) return ''

  const payload = decodePublicCustomerAccessPayload(encodedPayload)
  if (!payload || payload.tenantId !== tenantId) return ''
  if (!payload.phone || typeof payload.phone !== 'string') return ''
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return ''

  return normalizePhoneContact(payload.phone)
}

export function doesPublicCustomerAccessMatchOrder(
  phone: string,
  pedido: PedidoPublicCustomerContact,
) {
  const normalizedPhone = normalizePhoneContact(phone)
  if (!normalizedPhone) return false

  return [pedido.clienteTelefone, pedido.clienteWhatsapp]
    .map((value) => normalizePhoneContact(value))
    .filter(Boolean)
    .includes(normalizedPhone)
}
