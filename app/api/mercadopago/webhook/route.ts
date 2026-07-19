import { NextRequest, NextResponse } from 'next/server'
import {
  getMercadoPagoWebhookSecret,
  validateMercadoPagoWebhookSignature,
} from '@/lib/mercado-pago'
import { syncMercadoPagoPaymentById } from '@/lib/mercado-pago-sync'

export const runtime = 'nodejs'

type MercadoPagoWebhookPayload = {
  id?: string | number
  action?: string
  type?: string
  data?: {
    id?: string | number
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

  const notificationId = String(body.id ?? '').trim() || `payment:${dataId}:${body.action ?? 'updated'}`
  const result = await syncMercadoPagoPaymentById({
    paymentId: dataId,
    notificationId,
    origin: 'WEBHOOK',
  })

  if (!result.ok) {
    return NextResponse.json({ ok: true, ignored: true, reason: result.reason })
  }

  if (result.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  return NextResponse.json({ ok: true })
}
