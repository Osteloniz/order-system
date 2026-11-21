import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

const PUBLIC_ORDER_SOFT_HOLD_MS = 10 * 60_000

function buildShadowCommittedOrderWhere(tenantId: string, now = new Date()): Prisma.PedidoWhereInput {
  const recentSoftHoldCutoff = new Date(now.getTime() - PUBLIC_ORDER_SOFT_HOLD_MS)

  return {
    tenantId,
    origem: 'LEGADO',
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
        status: { in: ['ACEITO', 'PREPARACAO', 'PRONTO_ENTREGA'] },
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
    pedido: Prisma.TransactionClient['pedido']
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

export async function loadShadowCommittedQuantityMapTx(tx: Prisma.TransactionClient, tenantId: string, now = new Date()) {
  return loadShadowCommittedQuantityMapFromClient(tx, tenantId, now)
}

export async function reservedInShadow(tx: Prisma.TransactionClient, tenantId: string, produtoId: string, excludeOrder?: string | null) {
  const result = await tx.itemPedido.aggregate({
    where: { produtoId, pedido: { ...buildShadowCommittedOrderWhere(tenantId), ...(excludeOrder && { id: { not: excludeOrder } }) } },
    _sum: { quantidade: true },
  })
  return result._sum.quantidade ?? 0
}
