import { NextRequest, NextResponse } from 'next/server'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'
import { syncOrderStockForTransition } from '@/lib/order-stock'
import { canUseReadyToDeliverStatus, shouldUsePreparacaoStage } from '@/lib/order-status'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'

export const runtime = 'nodejs'

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'PRONTO_ENTREGA', 'ENTREGUE', 'CANCELADO']

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
    if (status === 'PRONTO_ENTREGA' && !canUseReadyToDeliverStatus(pedidoAtual.statusPagamento)) {
      return NextResponse.json(
        { error: 'Pronto para entregar so pode ser usado quando o pagamento estiver aprovado.' },
        { status: 400 }
      )
    }
    if (status === 'PRONTO_ENTREGA') {
      const needsPreparacaoStage = shouldUsePreparacaoStage(pedidoAtual)
      if (needsPreparacaoStage && pedidoAtual.status !== 'PREPARACAO' && pedidoAtual.status !== 'ENTREGUE') {
        return NextResponse.json(
          { error: 'Para encomendas, pronto para entregar so fica disponivel depois do preparo.' },
          { status: 400 }
        )
      }
    }
    if (pedidoAtual.status === status) {
      return NextResponse.json(pedidoAtual)
    }
    const actorNome = admin.session.user?.name?.toString().trim() || null

    try {
      const pedidoAtualizado = await prisma.$transaction(async (tx) => {
        const pedidoAtualTransacao = await tx.pedido.findFirst({
          where: { id, tenantId: admin.tenantId },
          include: { itens: true },
        })

        if (!pedidoAtualTransacao) {
          throw new Error('Pedido nao encontrado')
        }

        const pedidoNumero = numeroPedidoCurto(pedidoAtualTransacao.id) ?? pedidoAtualTransacao.id
        const estoqueControle = await syncOrderStockForTransition({
          tx,
          tenantId: admin.tenantId,
          pedidoAtual: pedidoAtualTransacao,
          targetStatus: status,
          targetStatusPagamento: pedidoAtualTransacao.statusPagamento,
          actorNome,
          pedidoNumero,
        })

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
          descricao: `Status do pedido #${pedidoNumero} alterado de ${pedidoAtualTransacao.status} para ${status}.`,
          actorNome,
          pedidoId: pedidoAtualTransacao.id,
          pedidoNumero,
          metadata: {
            statusAnterior: pedidoAtualTransacao.status,
            statusNovo: status,
            motivoCancelamento: status === 'CANCELADO' ? motivoCancelamento ?? null : null,
          },
        })

        return atualizado
      })

      appLogger.info(`[api/admin/pedidos/[id]/status] Pedido ${id} atualizado para status: ${status}`)

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
