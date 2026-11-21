import { z } from 'zod'
import { caixaFeeSelection, defaultCaixaFeeRates } from '@/lib/caixa-fees'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { prisma } from '@/lib/db'
import { lockTenantStock } from '@/lib/stock-lock'

const basisPoints = z.number().int().min(0).max(10_000)
const ratesSchema = z.object({
  caixaTaxaCreditoBp: basisPoints,
  caixaTaxaDebitoBp: basisPoints,
}).strict()

export const GET = caixaRoute(async (_request, { tenantId }) => {
  const rates = await prisma.configuracao.findUnique({ where: { tenantId }, select: caixaFeeSelection })
  return caixaJson(rates ?? defaultCaixaFeeRates)
}, { admin: true })

export const PUT = caixaRoute(async (request, { id, tenantId }) => {
  const rates = ratesSchema.parse(await request.json())
  const result = await prisma.$transaction(async (tx) => {
    await lockTenantStock(tx, tenantId)
    const anterior = await tx.configuracao.findUnique({ where: { tenantId }, select: caixaFeeSelection })
    const atual = await tx.configuracao.upsert({
      where: { tenantId },
      create: { tenantId, nomeEstabelecimento: 'Estabelecimento', enderecoRetirada: 'Endereco nao configurado', ...rates },
      update: rates,
      select: caixaFeeSelection,
    })
    await tx.authAuditLog.create({
      data: { tenantId, adminUserId: id, action: 'CAIXA_TAXAS_ALTERADAS', metadata: { anterior: anterior ?? defaultCaixaFeeRates, atual } },
    })
    return atual
  })
  return caixaJson(result)
}, { admin: true, mutation: true })
