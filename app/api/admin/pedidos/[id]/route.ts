import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { addAvailableStock, releaseReservedToAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

// DELETE /api/admin/pedidos/:id - Remove pedido nao pago ou cancelado.
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
    include: {
      itens: {
        select: {
          id: true,
          produtoId: true,
          quantidade: true,
          quantidadePreparada: true,
        },
      },
    },
  })

  if (!pedido) {
    return NextResponse.json(
      { error: 'Pedido nao encontrado' },
      { status: 404 }
    )
  }

  if (pedido.statusPagamento === 'APROVADO' && pedido.status !== 'CANCELADO') {
    return NextResponse.json(
      { error: 'Pedidos pagos so podem ser excluidos depois de cancelados' },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    if (
      pedido.tipoEntrega !== 'ENCOMENDA' &&
      pedido.estoqueBaixadoEm &&
      (pedido.status === 'ACEITO' || pedido.status === 'PREPARACAO' || pedido.status === 'ENTREGUE')
    ) {
      for (const item of pedido.itens) {
        await addAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade)
      }
    }

    if (pedido.tipoEntrega === 'ENCOMENDA') {
      for (const item of pedido.itens) {
        if (item.quantidadePreparada > 0) {
          await releaseReservedToAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidadePreparada)
        }
      }
    }

    await tx.itemPedido.deleteMany({ where: { pedidoId: id } })
    await tx.pedido.delete({ where: { id } })
  })

  console.log(`[v0] Pedido ${id} excluido`)

  return NextResponse.json({ success: true })
}
