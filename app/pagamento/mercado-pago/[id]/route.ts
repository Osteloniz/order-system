import { NextRequest, NextResponse } from 'next/server'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import { syncMercadoPagoPaymentById } from '@/lib/mercado-pago-sync'
import {
  generatePublicOrderAccessToken,
  hashPublicOrderAccessToken,
  isValidAsaasReturnToken,
  setPublicOrderAccessCookie,
} from '@/lib/public-order-access'
import { setPublicCustomerAccessCookie } from '@/lib/public-customer-access'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const returnToken = request.nextUrl.searchParams.get('token')?.trim() || ''
  const paymentState = request.nextUrl.searchParams.get('status')?.trim() || 'return'
  const paymentId = request.nextUrl.searchParams.get('payment_id')?.trim() || ''
  let syncPending = false

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: {
      id: true,
      asaasReturnTokenHash: true,
      tenantId: true,
      clienteTelefone: true,
      clienteWhatsapp: true,
    },
  })

  if (!pedido?.asaasReturnTokenHash || !isValidAsaasReturnToken(returnToken, pedido.asaasReturnTokenHash)) {
    return NextResponse.redirect(new URL('/menu', request.url))
  }

  if (paymentId) {
    try {
      const result = await syncMercadoPagoPaymentById({
        paymentId,
        notificationId: `return:${paymentId}:${paymentState}`,
        origin: 'RETURN',
      })

      if (!result.ok) {
        syncPending = true
        appLogger.warn('[mercado-pago:return] retorno sem sincronizacao imediata', {
          pedidoId: id,
          paymentId,
          reason: result.reason,
        })
      }
    } catch (error) {
      syncPending = true
      appLogger.error('[mercado-pago:return] falha ao sincronizar pagamento no retorno', error)
    }
  }

  const publicAccessToken = generatePublicOrderAccessToken()
  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      publicAccessTokenHash: hashPublicOrderAccessToken(publicAccessToken),
      publicAccessTokenIssuedAt: new Date(),
    },
  })

  const redirectUrl = new URL(`/confirmacao/${pedido.id}`, request.url)
  redirectUrl.searchParams.set('payment', paymentState)
  if (syncPending) {
    redirectUrl.searchParams.set('sync', 'pending')
  }
  const response = NextResponse.redirect(redirectUrl)
  setPublicOrderAccessCookie(response, pedido.id, publicAccessToken)
  setPublicCustomerAccessCookie(response, pedido.tenantId, pedido.clienteWhatsapp || pedido.clienteTelefone)
  return response
}
