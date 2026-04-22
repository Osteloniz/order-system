import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'
import { addAvailableStock, consumeAvailableStock, consumeReservedStock, releaseReservedToAvailableStock, reserveFromAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'ENTREGUE', 'CANCELADO']
type Tx = Prisma.TransactionClient
type PedidoComItens = Prisma.PedidoGetPayload<{ include: { itens: true } }>

function statusConsomeEstoque(status: StatusPedido) {
  return status === 'ACEITO' || status === 'PREPARACAO' || status === 'ENTREGUE'
}

function classificarEstadoEncomenda(status: StatusPedido) {
  if (status === 'PREPARACAO') return 'RESERVADO' as const
  if (status === 'ENTREGUE') return 'CONSUMIDO' as const
  return 'LIVRE' as const
}

async function sincronizarPedidoComum(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoComItens
  targetStatus: StatusPedido
}) {
  const { tx, tenantId, pedidoAtual, targetStatus } = params
  const consumiaAntes = Boolean(pedidoAtual.estoqueBaixadoEm)
  const deveConsumirAgora = statusConsomeEstoque(targetStatus)

  if (!consumiaAntes && deveConsumirAgora) {
    for (const item of pedidoAtual.itens) {
      await consumeAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot)
    }
  }

  if (consumiaAntes && !deveConsumirAgora) {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade)
    }
  }

  return deveConsumirAgora ? pedidoAtual.estoqueBaixadoEm ?? new Date() : null
}

async function sincronizarPedidoEncomenda(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoComItens
  targetStatus: StatusPedido
}) {
  const { tx, tenantId, pedidoAtual, targetStatus } = params
  const estadoAtual = classificarEstadoEncomenda(pedidoAtual.status)
  const estadoDestino = classificarEstadoEncomenda(targetStatus)

  if (estadoAtual === estadoDestino) {
    return
  }

  if (estadoAtual === 'LIVRE' && estadoDestino === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot)
      await tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: item.quantidade,
          preparadoEm: item.preparadoEm ?? new Date(),
        },
      })
    }
    return
  }

  if (estadoAtual === 'LIVRE' && estadoDestino === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      await consumeAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot)
      await tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: item.quantidade,
          preparadoEm: item.preparadoEm ?? new Date(),
        },
      })
    }
    return
  }

  if (estadoAtual === 'RESERVADO' && estadoDestino === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      if (item.quantidadePreparada > 0) {
        await releaseReservedToAvailableStock(tx, tenantId, item.produtoId, item.quantidadePreparada)
      }
      await tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: 0,
          preparadoEm: null,
        },
      })
    }
    return
  }

  if (estadoAtual === 'RESERVADO' && estadoDestino === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      if (item.quantidadePreparada > 0) {
        await consumeReservedStock(tx, tenantId, item.produtoId, item.quantidadePreparada)
      }
    }
    return
  }

  if (estadoAtual === 'CONSUMIDO' && estadoDestino === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade)
      await tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: 0,
          preparadoEm: null,
        },
      })
    }
    return
  }

  if (estadoAtual === 'CONSUMIDO' && estadoDestino === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade)
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot)
      await tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: item.quantidade,
          preparadoEm: item.preparadoEm ?? new Date(),
        },
      })
    }
  }
}

// PATCH /api/admin/pedidos/:id/status - Atualiza status do pedido
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { status, motivoCancelamento } = body as {
      status: StatusPedido
      motivoCancelamento?: string
    }

    if (!statusValidos.includes(status)) {
      return NextResponse.json(
        { error: 'Status invalido' },
        { status: 400 }
      )
    }

    const pedidoAtual = await prisma.pedido.findFirst({
      where: { id, tenantId: admin.tenantId },
      include: { itens: true },
    })
    if (!pedidoAtual) {
      return NextResponse.json(
        { error: 'Pedido nao encontrado' },
        { status: 404 }
      )
    }
    if (pedidoAtual.status === status) {
      return NextResponse.json(pedidoAtual)
    }

    try {
      const pedidoAtualizado = await prisma.$transaction(async (tx) => {
        const estoqueBaixadoEm = pedidoAtual.tipoEntrega === 'ENCOMENDA'
          ? pedidoAtual.estoqueBaixadoEm
          : await sincronizarPedidoComum({
            tx,
            tenantId: admin.tenantId,
            pedidoAtual,
            targetStatus: status,
          })

        if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
          await sincronizarPedidoEncomenda({
            tx,
            tenantId: admin.tenantId,
            pedidoAtual,
            targetStatus: status,
          })
        }

        return tx.pedido.update({
          where: { id },
          data: {
            status,
            motivoCancelamento: status === 'CANCELADO'
              ? (typeof motivoCancelamento === 'string' && motivoCancelamento.trim() ? motivoCancelamento.trim() : 'Cancelado manualmente no painel')
              : null,
            estoqueBaixadoEm,
          },
          include: { itens: true }
        })
      })

      console.log(`[v0] Pedido ${id} atualizado para status: ${status}`)

      return NextResponse.json(pedidoAtualizado)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Erro ao atualizar status' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[v0] Erro ao atualizar status:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
