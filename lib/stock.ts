import type { LogOperacaoTipo, Prisma } from '@prisma/client'
import { registrarLogOperacao } from '@/lib/operation-log'

type Tx = Prisma.TransactionClient

type StockLogOptions = {
  tipo: LogOperacaoTipo
  descricao: string
  actorNome?: string | null
  pedidoId?: string | null
  pedidoNumero?: string | null
  metadata?: Prisma.InputJsonValue
  nomeProduto?: string | null
}

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

async function resolveProdutoNome(tx: Tx, produtoId: string, nomeProduto?: string | null) {
  if (nomeProduto?.trim()) return nomeProduto.trim()

  const produto = await tx.produto.findUnique({
    where: { id: produtoId },
    select: { nome: true },
  })

  return produto?.nome ?? 'Produto'
}

async function registrarMovimentacaoEstoque(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  estoque: { quantidadeDisponivel: number; quantidadeReservada: number },
  quantidade: number,
  options?: StockLogOptions
) {
  if (!options) return
  if (quantidade === 0) return

  const produtoNome = await resolveProdutoNome(tx, produtoId, options.nomeProduto)
  await registrarLogOperacao(tx, {
    tenantId,
    tipo: options.tipo,
    descricao: options.descricao,
    actorNome: options.actorNome,
    produtoId,
    produtoNome,
    pedidoId: options.pedidoId,
    pedidoNumero: options.pedidoNumero,
    quantidade,
    saldoDisponivel: estoque.quantidadeDisponivel,
    saldoReservado: estoque.quantidadeReservada,
    metadata: options.metadata,
  })
}

export async function setAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidadeDisponivel: number,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel },
  })
  await registrarMovimentacaoEstoque(
    tx,
    tenantId,
    produtoId,
    atualizado,
    quantidadeDisponivel - estoque.quantidadeDisponivel,
    options
  )
  return atualizado
}

export async function addAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel: { increment: quantidade } },
  })
  await registrarMovimentacaoEstoque(tx, tenantId, produtoId, atualizado, quantidade, options)
  return atualizado
}

export async function consumeAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  nomeProduto: string,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  if (estoque.quantidadeDisponivel < quantidade) {
    throw new Error(`Estoque insuficiente para ${nomeProduto}. Disponivel: ${estoque.quantidadeDisponivel}. Necessario: ${quantidade}.`)
  }

  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: { quantidadeDisponivel: { decrement: quantidade } },
  })
  await registrarMovimentacaoEstoque(
    tx,
    tenantId,
    produtoId,
    atualizado,
    -quantidade,
    options ? { ...options, nomeProduto } : undefined
  )
  return atualizado
}

export async function reserveFromAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  nomeProduto: string,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  if (estoque.quantidadeDisponivel < quantidade) {
    throw new Error(`Estoque insuficiente para reservar ${nomeProduto}. Disponivel: ${estoque.quantidadeDisponivel}. Necessario: ${quantidade}.`)
  }

  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeDisponivel: { decrement: quantidade },
      quantidadeReservada: { increment: quantidade },
    },
  })
  await registrarMovimentacaoEstoque(
    tx,
    tenantId,
    produtoId,
    atualizado,
    quantidade,
    options ? { ...options, nomeProduto } : undefined
  )
  return atualizado
}

export async function releaseReservedToAvailableStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  const quantidadeLiberada = Math.min(quantidade, estoque.quantidadeReservada)
  if (quantidadeLiberada <= 0) return estoque

  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeDisponivel: { increment: quantidadeLiberada },
      quantidadeReservada: { decrement: quantidadeLiberada },
    },
  })
  await registrarMovimentacaoEstoque(tx, tenantId, produtoId, atualizado, quantidadeLiberada, options)
  return atualizado
}

export async function consumeReservedStock(
  tx: Tx,
  tenantId: string,
  produtoId: string,
  quantidade: number,
  options?: StockLogOptions
) {
  const estoque = await getOrCreateStock(tx, tenantId, produtoId)
  const quantidadeReservadaConsumida = Math.min(quantidade, estoque.quantidadeReservada)
  const quantidadeConsumirDisponivel = quantidade - quantidadeReservadaConsumida

  if (quantidadeConsumirDisponivel > 0 && estoque.quantidadeDisponivel < quantidadeConsumirDisponivel) {
    throw new Error(
      `Estoque insuficiente para concluir a baixa. Reservado: ${estoque.quantidadeReservada}. Disponivel: ${estoque.quantidadeDisponivel}. Necessario: ${quantidade}.`,
    )
  }

  const atualizado = await tx.produtoEstoque.update({
    where: { id: estoque.id },
    data: {
      quantidadeReservada: { decrement: quantidadeReservadaConsumida },
      quantidadeDisponivel: quantidadeConsumirDisponivel > 0
        ? { decrement: quantidadeConsumirDisponivel }
        : undefined,
    },
  })
  await registrarMovimentacaoEstoque(tx, tenantId, produtoId, atualizado, -quantidade, options)
  return atualizado
}
