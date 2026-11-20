import { z } from 'zod'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { expressMeio } from '@/lib/caixa-sales'
import { vincularClienteVendaCaixa } from '@/lib/caixa-vinculo'
import { prisma } from '@/lib/db'
import { numeroPedidoCurto } from '@/lib/operation-log'

export const GET = caixaRoute(async (request, actor) => {
  const numero = z.string().trim().regex(/^[0-9a-fA-F]{8}$/).parse(request.nextUrl.searchParams.get('numero'))
  const vendas = await prisma.pedido.findMany({
    where: { tenantId: actor.tenantId, origem: 'CAIXA_EXPRESS', id: { endsWith: numero.toLowerCase() } },
    take: 10,
    select: {
      id: true, clienteId: true, clienteNome: true, total: true, status: true, statusPagamento: true, pagamento: true, tipoCartao: true,
      caixaRecebimentoAtualId: true, itens: { select: { produtoId: true, nomeProdutoSnapshot: true, quantidade: true } },
      caixaEventos: { orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
        select: { operacao: true, criadoEm: true, efetivoEm: true, atorId: true, bruto: true,
          taxa: true, meio: true, tipoCartao: true, motivo: true, detalhes: true } },
    },
  })
  return caixaJson({ vendas: vendas.map(({ pagamento, tipoCartao, ...venda }) => ({
    ...venda, numero: numeroPedidoCurto(venda.id), meio: expressMeio(pagamento, tipoCartao),
  })) })
}, { admin: true })

const vinculo = z.object({ pedidoId: z.string().uuid(), clienteId: z.string().uuid() }).strict()

export const POST = caixaRoute(async (request, actor) => {
  const { pedidoId, clienteId } = vinculo.parse(await request.json())
  return caixaJson(await vincularClienteVendaCaixa(actor, pedidoId, clienteId))
}, { admin: true, mutation: true })
