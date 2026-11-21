import 'server-only'
import type { CaixaEvento, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export function legacyFinancePeriod(start: Date, end: Date): Prisma.PedidoWhereInput {
  const period = { gte: start, lt: end }
  return { origem: 'LEGADO', OR: [
    { tipoEntrega: { not: 'ENCOMENDA' }, criadoEm: period },
    { tipoEntrega: 'ENCOMENDA', encomendaPara: period },
  ] }
}

export function caixaDeliveryPeriod(start: Date, end: Date): Prisma.PedidoWhereInput {
  return { origem: 'CAIXA_EXPRESS', entregueEm: { gte: start, lt: end } }
}

type EventoFinanceiro = Pick<CaixaEvento, 'id' | 'pedidoId' | 'operacao' | 'efetivoEm' | 'bruto' | 'taxa'
  | 'meio' | 'tipoCartao' | 'detalhes'>

export function resolveCaixaMovimentos<T extends EventoFinanceiro>(eventos: T[]) {
  const superseded = new Set(eventos.flatMap((evento) => {
    const detalhes = evento.detalhes
    return evento.operacao === 'CORRECAO' && detalhes && typeof detalhes === 'object' &&
      !Array.isArray(detalhes) && typeof detalhes.anteriorId === 'string' ? [detalhes.anteriorId] : []
  }))
  return eventos.flatMap((evento) => {
    if (superseded.has(evento.id) || !evento.efetivoEm || !evento.meio || evento.bruto === null) return []
    const taxa = evento.taxa ?? 0
    return [{ ...evento, efetivoEm: evento.efetivoEm, bruto: evento.bruto, taxa,
      meio: evento.meio, liquido: evento.bruto - taxa, saida: evento.operacao === 'ESTORNO' }]
  })
}

export async function caixaFinanceMovements(tenantId: string, start: Date, end: Date) {
  const eventos = await prisma.caixaEvento.findMany({
    where: { tenantId, efetivoEm: { gte: start, lt: end }, operacao: { in: ['VENDA', 'BAIXA', 'CORRECAO', 'ESTORNO'] } },
    select: {
      id: true, pedidoId: true, operacao: true, efetivoEm: true, bruto: true, taxa: true, meio: true,
      tipoCartao: true, detalhes: true, pedido: { select: { clienteNome: true, clienteTelefone: true, status: true, statusPagamento: true } },
    },
  })
  return resolveCaixaMovimentos(eventos)
}
