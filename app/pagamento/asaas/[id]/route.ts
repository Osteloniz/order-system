import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  generatePublicOrderAccessToken,
  hashPublicOrderAccessToken,
  isValidAsaasReturnToken,
  setPublicOrderAccessCookie,
} from '@/lib/public-order-access'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const returnToken = request.nextUrl.searchParams.get('token')?.trim() || ''
  const paymentState = request.nextUrl.searchParams.get('status')?.trim() || 'return'

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: {
      id: true,
      asaasReturnTokenHash: true,
    },
  })

  if (!pedido?.asaasReturnTokenHash || !isValidAsaasReturnToken(returnToken, pedido.asaasReturnTokenHash)) {
    return NextResponse.redirect(new URL('/menu', request.url))
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
  const response = NextResponse.redirect(redirectUrl)
  setPublicOrderAccessCookie(response, pedido.id, publicAccessToken)
  return response
}
