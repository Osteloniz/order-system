import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

async function getOrCreateStock(tx: Tx, tenantId: string, produtoId: string) {
  return tx.produtoEstoque.upsert({
    where: { tenantId_produtoId: { tenantId, produtoId } },
    create: {
      tenantId,
      produtoId,
      quantidadeDisponivel: 0,
      quantidadeReservada: 0,
    },
    update: {},
  })
}

export async function setAvailableStock(tx: Tx, tenantId: string, produtoId: string, quantidadeDisponivel: number) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel },
  })
}

export async function addAvailableStock(tx: Tx, tenantId: string, produtoId: string, quantidade: number) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel: { increment: quantidade } },
  })
}

export async function consumeAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  nomeProduto: string
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  if (estoque.quantidadeDisponivel < quantidade) {
    throw new Error(`Estoque insuficiente para ${nomeProduto}. Disponivel: ${estoque.quantidadeDisponivel}. Necessario: ${quantidade}.`)
  }

  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel: { decrement: quantidade } },
  })
}

export async function reserveFromAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  nomeProduto: string
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  if (estoque.quantidadeDisponivel < quantidade) {
    throw new Error(`Estoque insuficiente para reservar ${nomeProduto}. Disponivel: ${estoque.quantidadeDisponivel}. Necessario: ${quantidade}.`)
  }

  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeDisponivel: { decrement: quantidade },
      quantidadeReservada: { increment: quantidade },
    },
  })
}

export async function releaseReservedToAvailableStock(tx: Tx, tenantId: string, produtoId: string, quantidade: number) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  const quantidadeLiberada = Math.min(quantidade, estoque.quantidadeReservada)
  if (quantidadeLiberada <= 0) return estoque

  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeDisponivel: { increment: quantidadeLiberada },
      quantidadeReservada: { decrement: quantidadeLiberada },
    },
  })
}

export async function consumeReservedStock(tx: Tx, tenantId: string, produtoId: string, quantidade: number) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  if (estoque.quantidadeReservada < quantidade) {
    throw new Error(`Reserva insuficiente para concluir a encomenda. Reservado: ${estoque.quantidadeReservada}. Necessario: ${quantidade}.`)
  }

  return tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeReservada: { decrement: quantidade },
    },
  })
}
