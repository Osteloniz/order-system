import type { LogOperacaoTipo, Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export type RegistrarLogOperacaoParams = {
  tenantId: string
  tipo: LogOperacaoTipo
  descricao: string
  actorNome?: string | null
  produtoId?: string | null
  produtoNome?: string | null
  pedidoId?: string | null
  pedidoNumero?: string | null
  quantidade?: number | null
  saldoDisponivel?: number | null
  saldoReservado?: number | null
  metadata?: Prisma.InputJsonValue
}

export function numeroPedidoCurto(pedidoId?: string | null) {
  if (!pedidoId) return null
  return pedidoId.slice(-8).toUpperCase()
}

export async function registrarLogOperacao(tx: Tx, params: RegistrarLogOperacaoParams) {
  return tx.logOperacao.create({
    data: {
      tenantId: params.tenantId,
      tipo: params.tipo,
      descricao: params.descricao,
      actorNome: params.actorNome ?? null,
      produtoId: params.produtoId ?? null,
      produtoNome: params.produtoNome ?? null,
      pedidoId: params.pedidoId ?? null,
      pedidoNumero: params.pedidoNumero ?? numeroPedidoCurto(params.pedidoId),
      quantidade: params.quantidade ?? null,
      saldoDisponivel: params.saldoDisponivel ?? null,
      saldoReservado: params.saldoReservado ?? null,
      metadata: params.metadata,
    },
  })
}
