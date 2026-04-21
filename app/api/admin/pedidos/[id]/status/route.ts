import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'
import { addAvailableStock, consumeAvailableStock, releaseReservedToAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'ENTREGUE', 'CANCELADO']
const transicoesPermitidas: Record<StatusPedido, StatusPedido[]> = {
  FEITO: ['ACEITO', 'CANCELADO'],
  ACEITO: ['PREPARACAO', 'CANCELADO'],
  PREPARACAO: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: [],
  CANCELADO: []
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

    if (pedidoAtual.status === 'ENTREGUE') {
      return NextResponse.json(
        { error: 'Pedido entregue nao pode ser alterado' },
        { status: 400 }
      )
    }
    if (pedidoAtual.status === 'CANCELADO') {
      return NextResponse.json(
        { error: 'Pedido cancelado nao pode ser alterado' },
        { status: 400 }
      )
    }

    if (!transicoesPermitidas[pedidoAtual.status].includes(status)) {
      return NextResponse.json(
        { error: 'Transicao de status nao permitida' },
        { status: 400 }
      )
    }

    if (status === 'CANCELADO') {
      const motivoValido = typeof motivoCancelamento === 'string' && motivoCancelamento.trim().length > 0
      if (!motivoValido) {
        return NextResponse.json(
          { error: 'Motivo do cancelamento e obrigatorio' },
          { status: 400 }
        )
      }

      const pedidoCancelado = await prisma.$transaction(async (tx) => {
        if (
          pedidoAtual.tipoEntrega !== 'ENCOMENDA' &&
          pedidoAtual.estoqueBaixadoEm &&
          (pedidoAtual.status === 'ACEITO' || pedidoAtual.status === 'PREPARACAO')
        ) {
          for (const item of pedidoAtual.itens) {
            await addAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade)
          }
        }

        if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
          for (const item of pedidoAtual.itens) {
            if (item.quantidadePreparada > 0) {
              await releaseReservedToAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidadePreparada)
            }
            await tx.itemPedido.update({
              where: { id: item.id },
              data: {
                quantidadePreparada: 0,
                preparadoEm: null,
              },
            })
          }
        }

        return tx.pedido.update({
          where: { id },
          data: {
            status,
            motivoCancelamento: motivoCancelamento.trim(),
            estoqueBaixadoEm: pedidoAtual.tipoEntrega !== 'ENCOMENDA' ? null : pedidoAtual.estoqueBaixadoEm,
          },
          include: { itens: true }
        })
      })

      console.log(`[v0] Pedido ${id} atualizado para status: ${status}`)
      return NextResponse.json(pedidoCancelado)
    }

    try {
      const pedidoAtualizado = await prisma.$transaction(async (tx) => {
        const precisaBaixarEstoqueAgora =
          pedidoAtual.tipoEntrega !== 'ENCOMENDA' &&
          !pedidoAtual.estoqueBaixadoEm &&
          ['ACEITO', 'PREPARACAO', 'ENTREGUE'].includes(status)

        if (precisaBaixarEstoqueAgora) {
          if (!pedidoAtual.estoqueBaixadoEm) {
            for (const item of pedidoAtual.itens) {
              await consumeAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot)
            }
          }
        }

        return tx.pedido.update({
          where: { id },
          data: {
            status,
            estoqueBaixadoEm: pedidoAtual.tipoEntrega !== 'ENCOMENDA' && ['ACEITO', 'PREPARACAO', 'ENTREGUE'].includes(status)
              ? pedidoAtual.estoqueBaixadoEm ?? new Date()
              : pedidoAtual.estoqueBaixadoEm,
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
