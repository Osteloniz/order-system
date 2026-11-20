import { z } from 'zod'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { prisma } from '@/lib/db'

const schema = z.object({ temaVisual: z.enum(['PADRAO', 'NATAL', 'ANO_NOVO']) }).strict()

export const GET = caixaRoute(async (_request, actor) => {
  const config = await prisma.configuracao.findUnique({ where: { tenantId: actor.tenantId }, select: { temaVisual: true } })
  return caixaJson({ temaVisual: config?.temaVisual ?? 'PADRAO' })
}, { admin: true })

export const PATCH = caixaRoute(async (request, actor) => {
  const { temaVisual } = schema.parse(await request.json())
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${actor.tenantId} FOR UPDATE`
    const config = await tx.configuracao.findUnique({ where: { tenantId: actor.tenantId }, select: { temaVisual: true } })
    const anterior = config?.temaVisual ?? 'PADRAO'
    if (anterior === temaVisual) return
    await tx.configuracao.upsert({
      where: { tenantId: actor.tenantId }, update: { temaVisual },
      create: { tenantId: actor.tenantId, nomeEstabelecimento: 'Brookie', enderecoRetirada: '', temaVisual },
    })
    await tx.authAuditLog.create({ data: { tenantId: actor.tenantId, adminUserId: actor.id,
      action: 'TEMA_VISUAL_ALTERADO', metadata: { anterior, temaVisual } } })
  })
  return caixaJson({ temaVisual })
}, { admin: true, mutation: true })
