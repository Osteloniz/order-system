import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { StatusPagamento, StatusPedido, TipoEntrega, TipoPagamento } from '@/lib/types'
import { addAvailableStock, consumeAvailableStock, consumeReservedStock, releaseReservedToAvailableStock, reserveFromAvailableStock } from '@/lib/stock'

type Tx = Prisma.TransactionClient

type ItemPedidoStock = {
  id: string
  produtoId: string
  quantidade: number
  nomeProdutoSnapshot: string
  quantidadePreparada: number
  preparadoEm: Date | null
}

export type PedidoStockContext = {
  id: string
  status: StatusPedido
  statusPagamento: StatusPagamento
  pagamento: TipoPagamento
  tipoEntrega: TipoEntrega
  estoqueReservadoEm: Date | null
  estoqueBaixadoEm: Date | null
  itens: ItemPedidoStock[]
}

type TargetPedidoStockContext = Pick<PedidoStockContext, 'status' | 'statusPagamento' | 'pagamento' | 'tipoEntrega'>

type StockLifecycleState = 'LIVRE' | 'RESERVADO' | 'CONSUMIDO'

export const PUBLIC_ORDER_SOFT_HOLD_MINUTES = 10

export function shouldReserveCommonOrderStock(context: Pick<PedidoStockContext, 'status' | 'statusPagamento' | 'pagamento'>) {
  if (context.status === 'ENTREGUE' || context.status === 'CANCELADO') {
    return false
  }

  if (context.pagamento === 'DINHEIRO') {
    return context.status !== 'FEITO'
  }

  return context.statusPagamento === 'APROVADO'
}

function buildShadowCommittedOrderWhere(tenantId: string, now = new Date()): Prisma.PedidoWhereInput {
  const recentSoftHoldCutoff = new Date(now.getTime() - PUBLIC_ORDER_SOFT_HOLD_MINUTES * 60 * 1000)

  return {
    tenantId,
    estoqueReservadoEm: null,
    estoqueBaixadoEm: null,
    OR: [
      {
        tipoEntrega: { not: 'ENCOMENDA' },
        status: 'FEITO',
        criadoEm: { gte: recentSoftHoldCutoff },
      },
      {
        tipoEntrega: { not: 'ENCOMENDA' },
        pagamento: 'DINHEIRO',
        status: { in: ['ACEITO', 'PREPARACAO', 'PRONTO_ENTREGA'] },
      },
      {
        tipoEntrega: { not: 'ENCOMENDA' },
        pagamento: { in: ['PIX', 'CARTAO'] },
        statusPagamento: 'APROVADO',
        status: { notIn: ['CANCELADO', 'ENTREGUE'] },
      },
      {
        tipoEntrega: 'ENCOMENDA',
        status: { in: ['PREPARACAO', 'PRONTO_ENTREGA'] },
      },
    ],
  }
}

async function loadShadowCommittedQuantityMapFromClient(
  client: {
    pedido: {
      findMany: (args: Prisma.PedidoFindManyArgs) => Promise<Array<{
        itens: Array<{
          produtoId: string
          quantidade: number
        }>
      }>>
    }
  },
  tenantId: string,
  now = new Date(),
) {
  const pedidos = await client.pedido.findMany({
    where: {
      ...buildShadowCommittedOrderWhere(tenantId, now),
    },
    select: {
      itens: {
        select: {
          produtoId: true,
          quantidade: true,
        },
      },
    },
  })

  const shadowMap = new Map<string, number>()

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      shadowMap.set(item.produtoId, (shadowMap.get(item.produtoId) ?? 0) + item.quantidade)
    }
  }

  return shadowMap
}

export async function loadShadowCommittedQuantityMap(tenantId: string, now = new Date()) {
  return loadShadowCommittedQuantityMapFromClient(prisma, tenantId, now)
}

export async function loadShadowCommittedQuantityMapTx(tx: Tx, tenantId: string, now = new Date()) {
  return loadShadowCommittedQuantityMapFromClient(tx, tenantId, now)
}

export async function lockProductStockRows(tx: Tx, tenantId: string, productIds: string[]) {
  const normalizedIds = Array.from(new Set(productIds.filter(Boolean)))
  if (normalizedIds.length === 0) return

  await tx.$queryRaw(
    Prisma.sql`
      SELECT "produtoId"
      FROM "ProdutoEstoque"
      WHERE "tenantId" = ${tenantId}
        AND "produtoId" IN (${Prisma.join(normalizedIds)})
      FOR UPDATE
    `,
  )
}

function classifyCurrentCommonStockState(pedido: Pick<PedidoStockContext, 'estoqueReservadoEm' | 'estoqueBaixadoEm'>) {
  if (pedido.estoqueBaixadoEm) return 'CONSUMIDO' as const
  if (pedido.estoqueReservadoEm) return 'RESERVADO' as const
  return 'LIVRE' as const
}

function classifyTargetCommonStockState(context: Pick<TargetPedidoStockContext, 'status' | 'statusPagamento' | 'pagamento'>): StockLifecycleState {
  if (context.status === 'ENTREGUE') return 'CONSUMIDO'
  if (shouldReserveCommonOrderStock(context)) return 'RESERVADO'
  return 'LIVRE'
}

function classifyEncomendaStockState(status: StatusPedido): StockLifecycleState {
  if (status === 'PREPARACAO' || status === 'PRONTO_ENTREGA') return 'RESERVADO'
  if (status === 'ENTREGUE') return 'CONSUMIDO'
  return 'LIVRE'
}

async function syncCommonOrderStock(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoStockContext
  targetContext: Pick<TargetPedidoStockContext, 'status' | 'statusPagamento' | 'pagamento'>
  actorNome?: string | null
  pedidoNumero: string
}) {
  const { tx, tenantId, pedidoAtual, targetContext, actorNome, pedidoNumero } = params
  const currentState = classifyCurrentCommonStockState(pedidoAtual)
  const targetState = classifyTargetCommonStockState(targetContext)

  if (currentState === targetState) {
    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
    }
  }

  if (currentState === 'LIVRE' && targetState === 'RESERVADO') {
    for (const item of pedidoAtual.itens) {
      await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Reserva operacional do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        metadata: {
          deStatus: pedidoAtual.status,
          paraStatus: targetContext.status,
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
          origem: 'PEDIDO_COMUM',
        },
      })
    }

    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'LIVRE' && targetState === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      await consumeAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Baixa por entrega do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        metadata: {
          deStatus: pedidoAtual.status,
          paraStatus: targetContext.status,
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
        },
      })
    }

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (currentState === 'RESERVADO' && targetState === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await releaseReservedToAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'LIBERACAO_RESERVA',
        descricao: `Liberacao da reserva do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: {
          deStatus: pedidoAtual.status,
          paraStatus: targetContext.status,
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
        },
      })
    }

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'RESERVADO' && targetState === 'CONSUMIDO') {
    for (const item of pedidoAtual.itens) {
      await consumeReservedStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Baixa efetiva do pedido #${pedidoNumero} ao entregar o que estava reservado.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: {
          deStatus: pedidoAtual.status,
          paraStatus: targetContext.status,
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
          origem: 'PEDIDO_COMUM',
        },
      })
    }

    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (currentState === 'CONSUMIDO' && targetState === 'LIVRE') {
    for (const item of pedidoAtual.itens) {
      await addAvailableStock(tx, tenantId, item.produtoId, item.quantidade, {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno da baixa do pedido #${pedidoNumero} ao sair de Entregue.`,
        actorNome,
        pedidoId: pedidoAtual.id,
        pedidoNumero,
        nomeProduto: item.nomeProdutoSnapshot,
        metadata: {
          deStatus: pedidoAtual.status,
          paraStatus: targetContext.status,
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
        },
      })
    }

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'CONSUMIDO' && targetState === 'RESERVADO') {
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
        metadata: {
          origem: 'PEDIDO_COMUM',
          pagamento: targetContext.pagamento,
          statusPagamento: targetContext.statusPagamento,
        },
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

async function syncEncomendaStock(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoStockContext
  targetStatus: StatusPedido
  actorNome?: string | null
  pedidoNumero: string
}) {
  const { tx, tenantId, pedidoAtual, targetStatus, actorNome, pedidoNumero } = params
  const currentState = classifyEncomendaStockState(pedidoAtual.status)
  const targetState = classifyEncomendaStockState(targetStatus)

  if (currentState === targetState) {
    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
    }
  }

  if (currentState === 'LIVRE' && targetState === 'RESERVADO') {
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

    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'LIVRE' && targetState === 'CONSUMIDO') {
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

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (currentState === 'RESERVADO' && targetState === 'LIVRE') {
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

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'RESERVADO' && targetState === 'CONSUMIDO') {
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

    return {
      estoqueReservadoEm: pedidoAtual.estoqueReservadoEm ?? new Date(),
      estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm ?? new Date(),
    }
  }

  if (currentState === 'CONSUMIDO' && targetState === 'LIVRE') {
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

    return {
      estoqueReservadoEm: null,
      estoqueBaixadoEm: null,
    }
  }

  if (currentState === 'CONSUMIDO' && targetState === 'RESERVADO') {
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

  return {
    estoqueReservadoEm: pedidoAtual.estoqueReservadoEm,
    estoqueBaixadoEm: pedidoAtual.estoqueBaixadoEm,
  }
}

export async function syncOrderStockForTransition(params: {
  tx: Tx
  tenantId: string
  pedidoAtual: PedidoStockContext
  targetStatus: StatusPedido
  targetStatusPagamento: StatusPagamento
  targetPagamento?: TipoPagamento
  actorNome?: string | null
  pedidoNumero: string
}) {
  const { tx, tenantId, pedidoAtual, targetStatus, targetStatusPagamento, targetPagamento, actorNome, pedidoNumero } = params

  const targetContext = {
    status: targetStatus,
    statusPagamento: targetStatusPagamento,
    pagamento: targetPagamento ?? pedidoAtual.pagamento,
    tipoEntrega: pedidoAtual.tipoEntrega,
  } satisfies TargetPedidoStockContext

  if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
    return syncEncomendaStock({
      tx,
      tenantId,
      pedidoAtual,
      targetStatus,
      actorNome,
      pedidoNumero,
    })
  }

  return syncCommonOrderStock({
    tx,
    tenantId,
    pedidoAtual,
    targetContext,
    actorNome,
    pedidoNumero,
  })
}
