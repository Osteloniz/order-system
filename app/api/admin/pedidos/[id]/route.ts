import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// DELETE /api/admin/pedidos/:id - Remove pedido (apenas se CANCELADO)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const pedido = await prisma.pedido.findFirst({
    where: { id, tenantId: admin.tenantId },
    select: { status: true }
  })

  if (!pedido) {
    return NextResponse.json(
      { error: 'Pedido nao encontrado' },
      { status: 404 }
    )
  }


  if (pedido.status !== 'CANCELADO') {
    return NextResponse.json(
      { error: 'Somente pedidos cancelados podem ser excluidos' },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.itemPedido.deleteMany({ where: { pedidoId: id } }),
    prisma.pedido.delete({ where: { id } })
  ])

  console.log(`[v0] Pedido ${id} excluido`)

  return NextResponse.json({ success: true })
}
