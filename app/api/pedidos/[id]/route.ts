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

// PATCH /api/pedidos/:id - Permite ao cliente cancelar enquanto nao foi aceito nem pago.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tenant = await getTenantFromCookie()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
  }

  const pedido = await prisma.pedido.findFirst({
    where: { id, tenantId: tenant.id },
    select: {
      id: true,
      status: true,
      statusPagamento: true,
    },
  })

  if (!pedido) {
    return NextResponse.json(
      { error: 'Pedido nao encontrado' },
      { status: 404 }
    )
  }

  if (pedido.status !== 'FEITO') {
    return NextResponse.json(
      { error: 'Pedido ja aceito. Entre em contato com a loja para cancelar.' },
      { status: 400 }
    )
  }

  if (pedido.statusPagamento === 'APROVADO') {
    return NextResponse.json(
      { error: 'Pedido pago nao pode ser cancelado pelo cliente.' },
      { status: 400 }
    )
  }

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: {
      status: 'CANCELADO',
      motivoCancelamento: 'Cancelado pelo cliente antes do aceite/pagamento',
    },
    include: { itens: true },
  })

  return NextResponse.json(pedidoAtualizado)
}
