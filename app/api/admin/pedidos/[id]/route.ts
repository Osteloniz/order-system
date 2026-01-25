import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// DELETE /api/admin/pedidos/:id - Remove pedido (apenas se CANCELADO)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const pedido = await prisma.pedido.findUnique({
    where: { id },
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

