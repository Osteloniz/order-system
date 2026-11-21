import { prisma } from '@/lib/db'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { expressSalesEnabled } from '@/lib/caixa-contract'
import { caixaCatalog } from '@/lib/caixa-sales'

export const GET = caixaRoute(async (_request, actor) => {
  const [produtos, maisVendidos] = await Promise.all([
    caixaCatalog(prisma, actor.tenantId),
    prisma.itemPedido.groupBy({
      by: ['produtoId'],
      where: { pedido: { tenantId: actor.tenantId, status: 'ENTREGUE' }, totalItem: { gt: 0 } },
      _sum: { quantidade: true }, orderBy: { _sum: { quantidade: 'desc' } }, take: 8,
    }),
  ])
  return caixaJson({ produtos: produtos.filter((produto) => produto.saldo > 0),
    maisVendidos: maisVendidos.map((item) => item.produtoId), novasVendas: expressSalesEnabled() })
})
