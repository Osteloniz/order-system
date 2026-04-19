import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'
import { createMercadoPagoPreference } from '@/lib/mercado-pago'

export const runtime = 'nodejs'

const preferenceSchema = z.object({
  pedidoId: z.string().uuid(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const parsed = preferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }

    const pedido = await prisma.pedido.findFirst({
      where: {
        id: parsed.data.pedidoId,
        tenantId: tenant.id,
      },
      include: { itens: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (pedido.pagamento !== 'PIX' && pedido.pagamento !== 'CARTAO') {
      return NextResponse.json(
        { error: 'Forma de pagamento nao usa Mercado Pago' },
        { status: 400 }
      )
    }

    const preference = await createMercadoPagoPreference(pedido)

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        statusPagamento: 'PENDENTE',
        mercadoPagoPreferenceId: preference.preferenceId,
      },
    })

    return NextResponse.json(preference)
  } catch (error) {
    console.error('[api/pagamentos/mercado-pago/preference] Erro:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar pagamento' },
      { status: 500 }
    )
  }
}
