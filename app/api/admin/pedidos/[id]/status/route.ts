import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { addAvailableStock, consumeAvailableStock, consumeReservedStock, releaseReservedToAvailableStock, reserveFromAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'ENTREGUE', 'CANCELADO']
type Tx = Prisma.TransactionClient
type PedidoComItens = Prisma.PedidoGetPayload<{ include: { itens: true } }>

function classificarEstadoPedidoComum(pedido: Pick<PedidoComItens, 'estoqueReservadoEm' | 'estoqueBaixadoEm'>) {
  if (pedido.estoqueBaixadoEm) return 'CONSUMIDO' as const
  if (pedido.estoqueReservadoEm) return 'RESERVADO' as const
  return 'LIVRE' as const
}

function classificarEstadoPedidoComumDestino(status: StatusPedido) {
  if (status === 'ACEITO' || status === 'PREPARACAO') return 'RESERVADO' as const
  if (status === 'ENTREGUE') return 'CONSUMIDO' as const
  return 'LIVRE' as const
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
  actorNome?: string | null
  pedidoNumero: string
}) {
  const { tx, tenantId, pedidoAtual, targetStatus, actorNome, pedidoNumero } = params
  const estadoAtual = classificarEstadoPedidoComum(pedidoAtual)
  const estadoDestino = classificarEstadoPedidoComumDestino(targetStatus)

  if (estadoAtual === estadoDestino) {
    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
    }
  }

  if (estadoAtual === 'LIVRE' && estadoDestino === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Reserva operacional do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        metadata: { deStatus: pedidoAtual.status, paraStatus: targetStatus, origem: 'PEDIDO_COMUM' },
      })
    }
    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: null,
    }
  }

  if (estadoAtual === 'LIVRE' && estadoDestino === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      await consumeAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Baixa por entrega do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        metadata: { deStatus: pedidoAtual.status, paraStatus: targetStatus },
      })
    }
    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (estadoAtual === 'RESERVADO' && estadoDestino === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await releaseReservedToAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'LIBERACAO_RESERVA',
        descricao: `Liberacao da reserva do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: { deStatus: pedidoAtual.status, paraStatus: targetStatus },
      })
    }
    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (estadoAtual === 'RESERVADO' && estadoDestino === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      await consumeReservedStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Baixa efetiva do pedido #${pedidoNumero} ao entregar o que estava reservado.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: { deStatus: pedidoAtual.status, paraStatus: targetStatus, origem: 'PEDIDO_COMUM' },
      })
    }
    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (estadoAtual === 'CONSUMIDO' && estadoDestino === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno da baixa do pedido #${pedidoNumero} ao sair de Entregue.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: { deStatus: pedidoAtual.status, paraStatus: targetStatus },
      })
    }
    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (estadoAtual === 'CONSUMIDO' && estadoDestino === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno temporario do pedido #${pedidoNumero} para voltar ao estado reservado.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
      })
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Nova reserva operacional do pedido #${pedidoNumero} apos retorno de status.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        metadata: { origem: 'PEDIDO_COMUM' },
      })
    }
    return {
      estoqueReservadoEm: new Date(),
      estoqueBaixadoEm: null,
    }
  }

  return {
    estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
    estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
  }
}

async function sincronizarPedidoEncomenda(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoComItens
  targetStatus: StatusPedido
  actorNome?: string | null
  pedidoNumero: string
}) {
  const { tx, tenantId, pedidoAtual, targetStatus, actorNome, pedidoNumero } = params
  const estadoAtual = classificarEstadoEncomenda(pedidoAtual.status)
  const estadoDestino = classificarEstadoEncomenda(targetStatus)

  if (estadoAtual === estadoDestino) {
    return
  }

  if (estadoAtual === 'LIVRE' && estadoDestino === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Reserva para encomenda do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
      })
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
      await consumeAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Baixa direta da encomenda do pedido #${pedidoNumero} entregue sem reserva previa.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
      })
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
        await releaseReservedToAvailableStock(tx, tenantId, item.produtoId, item.quantidadePreparada, {
          tipo: 'LIBERACAO_RESERVA',
          descricao: `Liberacao da reserva da encomenda #${pedidoNumero}.`,
          actorNome,
          pedidoId: pedidoAtual.id,
          pedidoNumero,
          nomeProduto: item.nomeProdutoSnapshot,
        })
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
        await consumeReservedStock(tx, tenantId, item.produtoId, item.quantidadePreparada, {
          tipo: 'BAIXA_ESTOQUE_ENTREGA',
          descricao: `Baixa da reserva ao entregar a encomenda #${pedidoNumero}.`,
          actorNome,
          pedidoId: pedidoAtual.id,
          pedidoNumero,
          nomeProduto: item.nomeProdutoSnapshot,
        })
      }
    }
    return
  }

  if (estadoAtual === 'CONSUMIDO' && estadoDestino === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno da encomenda #${pedidoNumero} ao sair de Entregue.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
      })
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
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno temporario da encomenda #${pedidoNumero} para voltar a status reservado.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
      })
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Nova reserva da encomenda #${pedidoNumero} apos retorno de status.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
      })
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
    const actorNome = admin.session.user?.name?.toString().trim() || null
    const pedidoNumero = numeroPedidoCurto(pedidoAtual.id) ?? pedidoAtual.id

    try {
      const pedidoAtualizado = await prisma.$transaction(async (tx) => {
        const estoqueControle = pedidoAtual.tipoEntrega === 'ENCOMENDA'
          ? {
            estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
            estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
          }
          : await sincronizarPedidoComum({
            tx,
            tenantId: admin.tenantId,
            pedidoAtual,
            targetStatus: status,
            actorNome,
            pedidoNumero,
          })

        if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
          await sincronizarPedidoEncomenda({
            tx,
            tenantId: admin.tenantId,
            pedidoAtual,
            targetStatus: status,
            actorNome,
            pedidoNumero,
          })
        }

        const atualizado = await tx.pedido.update({
          where: { id },
          data: {
            status,
            motivoCancelamento: status === 'CANCELADO'
              ? (typeof motivoCancelamento === 'string' && motivoCancelamento.trim() ? motivoCancelamento.trim() : 'Cancelado manualmente no painel')
              : null,
            estoqueReservadoEm: estoqueControle.estoqueReservadoEm,
            estoqueBaixadoEm: estoqueControle.estoqueBaixadoEm,
          },
          include: { itens: true }
        })

        await registrarLogOperacao(tx, {
          tenantId: admin.tenantId,
          tipo: 'PEDIDO_STATUS_ALTERADO',
          descricao: `Status do pedido #${pedidoNumero} alterado de ${pedidoAtual.status} para ${status}.`,
          actorNome,
          pedidoId: pedidoAtual.id,
          pedidoNumero,
          metadata: {
            statusAnterior: pedidoAtual.status,
            statusNovo: status,
            motivoCancelamento: status === 'CANCELADO' ? motivoCancelamento ?? null : null,
          },
        })

        return atualizado
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
