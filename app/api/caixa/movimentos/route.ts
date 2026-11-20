import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { operacaoCaixa } from '@/lib/caixa-contract'
import { movimentarVendaCaixa } from '@/lib/caixa-sales'

export const POST = caixaRoute(async (request, actor) => {
  const operacao = operacaoCaixa.parse(await request.json())
  return caixaJson(await movimentarVendaCaixa(actor, operacao))
}, { mutation: true })
