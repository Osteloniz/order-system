import { cestaCaixa } from '@/lib/caixa-contract'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { cotacaoCaixa } from '@/lib/caixa-sales'

export const POST = caixaRoute(async (request, actor) => {
  const itens = cestaCaixa.parse(await request.json())
  return caixaJson(await cotacaoCaixa(actor.tenantId, itens))
}, { mutation: true })
