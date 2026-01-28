import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

// GET /api/pedidos/:id - Detalhe do pedido
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tenant = await getTenantFromCookie()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
  }
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { itens: true }
  })

  if (!pedido || pedido.tenantId !== tenant.id) {
    return NextResponse.json(
      { error: 'Pedido nao encontrado' },
      { status: 404 }
    )
  }

  return NextResponse.json(pedido)
}
