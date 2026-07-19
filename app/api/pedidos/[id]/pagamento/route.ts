import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { inferHostedCheckoutGateway } from '@/lib/hosted-payment'
import { ensureOrderHostedCheckout, hasReusableHostedCheckout } from '@/lib/order-payment'
import { getPublicOrderAccessToken, isValidPublicOrderAccessToken } from '@/lib/public-order-access'
import { doesPublicCustomerAccessMatchOrder, getPublicCustomerAccessPhone } from '@/lib/public-customer-access'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

const pagamentoActionSchema = z.object({
  action: z.enum(['RESUME', 'REFRESH_LINK', 'PIX_FALLBACK']),
}).strict()

const pagamentoPedidoSelect = {
  id: true,
  tenantId: true,
  status: true,
  statusPagamento: true,
  pagamento: true,
  tipoCartao: true,
  clienteNome: true,
  clienteTelefone: true,
  clienteWhatsapp: true,
  asaasReturnTokenHash: true,
  asaasCheckoutId: true,
  asaasCheckoutUrl: true,
  asaasCheckoutExpiresAt: true,
  asaasPaymentId: true,
  asaasInvoiceUrl: true,
  asaasPixQrCode: true,
  asaasPixCopyPaste: true,
  asaasPaymentStatus: true,
  asaasLastEventId: true,
  asaasLastSyncAt: true,
  frete: true,
  subtotal: true,
  total: true,
  descontoValor: true,
  publicAccessTokenHash: true,
  itens: true,
} as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }

    const parsed = pagamentoActionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const { id } = await params
    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId: tenant.id },
      select: pagamentoPedidoSelect,
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    const accessToken = getPublicOrderAccessToken(request, id)
    const customerAccessPhone = getPublicCustomerAccessPhone(request, tenant.id)
    const hasOrderTokenAccess = Boolean(
      pedido.publicAccessTokenHash && isValidPublicOrderAccessToken(accessToken, pedido.publicAccessTokenHash),
    )
    const hasCustomerPhoneAccess = doesPublicCustomerAccessMatchOrder(customerAccessPhone, pedido)

    if (!hasOrderTokenAccess && !hasCustomerPhoneAccess) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (pedido.pagamento === 'DINHEIRO') {
      return NextResponse.json({ error: 'Esse pedido nao possui pagamento online.' }, { status: 400 })
    }

    if (parsed.data.action === 'RESUME') {
      if (!hasReusableHostedCheckout(pedido)) {
        return NextResponse.json(
          { error: 'O link atual nao esta mais disponivel. Gere um novo link de pagamento.' },
          { status: 400 },
        )
      }

      return NextResponse.json({
        checkoutUrl: pedido.asaasCheckoutUrl,
        expiresAt: pedido.asaasCheckoutExpiresAt,
        reused: true,
      })
    }

    if (parsed.data.action === 'PIX_FALLBACK') {
      if (pedido.pagamento !== 'PIX') {
        return NextResponse.json({ error: 'O QR Pix alternativo so pode ser usado em pedidos Pix.' }, { status: 400 })
      }

      const currentGateway =
        inferHostedCheckoutGateway(pedido.asaasCheckoutUrl) ||
        ((pedido.asaasPixQrCode || pedido.asaasPixCopyPaste) ? 'MERCADO_PAGO' : null)

      if (currentGateway !== 'MERCADO_PAGO') {
        return NextResponse.json(
          { error: 'Esse pedido nao usa Mercado Pago como gateway de pagamento.' },
          { status: 400 },
        )
      }
    }

    const result = await prisma.$transaction((tx) => ensureOrderHostedCheckout(tx, pedido, {
      forceRefresh: parsed.data.action === 'PIX_FALLBACK',
      mercadoPagoPixMode:
        pedido.pagamento === 'PIX' && parsed.data.action !== 'RESUME'
          ? 'DIRECT'
          : undefined,
    }))

    return NextResponse.json({
      checkoutUrl: result.pedido.asaasCheckoutUrl,
      expiresAt: result.pedido.asaasCheckoutExpiresAt,
      reused: result.reused,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao retomar o pagamento' },
      { status: 400 },
    )
  }
}
