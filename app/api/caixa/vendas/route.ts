import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { vendaCaixa } from '@/lib/caixa-contract'
import { concluirVendaCaixa, expressMeio } from '@/lib/caixa-sales'
import { prisma } from '@/lib/db'
import { numeroPedidoCurto } from '@/lib/operation-log'

export const POST = caixaRoute(async (request, actor) => {
  const venda = vendaCaixa.parse(await request.json())
  return caixaJson(await concluirVendaCaixa(actor, venda))
}, { mutation: true })

export const GET = caixaRoute(async (request, actor) => {
  const cursor = request.nextUrl.searchParams.get('cursor')
  const vendas = await prisma.pedido.findMany({
    where: { tenantId: actor.tenantId, origem: 'CAIXA_EXPRESS', status: 'ENTREGUE', statusPagamento: 'PENDENTE',
      ...(cursor && { id: { gt: cursor } }) },
    orderBy: { id: 'asc' }, take: 51,
    select: { id: true, clienteNome: true, clienteTelefone: true, total: true, pagamento: true, tipoCartao: true },
  })
  return caixaJson({ vendas: vendas.slice(0, 50).map(({ id, clienteNome, clienteTelefone, total, pagamento, tipoCartao }) => ({
    id, numero: numeroPedidoCurto(id), clienteNome, telefoneFinal: clienteTelefone?.slice(-4), total,
    meio: expressMeio(pagamento, tipoCartao),
  })), cursor: vendas.length > 50 ? vendas[49].id : null })
})
