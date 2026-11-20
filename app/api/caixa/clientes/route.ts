import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { expressSalesEnabled } from '@/lib/caixa-contract'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { prisma } from '@/lib/db'
import { getPhoneLookupCandidates, isValidPhone, normalizePhone } from '@/lib/phone'

const cliente = z.object({ nome: z.string().trim().min(2).max(80), telefone: z.string().max(32).refine(isValidPhone) }).strict()
const select = { id: true, nome: true, telefone: true } as const

function buscar(tenantId: string, telefone: string) {
  return prisma.cliente.findFirst({ where: { tenantId, telefone: { in: getPhoneLookupCandidates(telefone) } }, select })
}

export const GET = caixaRoute(async (request, actor) => {
  const telefone = request.nextUrl.searchParams.get('telefone') ?? ''
  if (telefone.length > 32 || !isValidPhone(telefone)) return caixaJson({ error: 'Informe um telefone válido.' }, 400)
  return caixaJson({ cliente: await buscar(actor.tenantId, telefone) })
})

export const POST = caixaRoute(async (request, actor) => {
  if (!expressSalesEnabled()) return caixaJson({ error: 'Novas vendas estão desativadas.' }, 403)
  const { nome, telefone } = cliente.parse(await request.json())
  const existing = await buscar(actor.tenantId, telefone)
  if (existing) return caixaJson({ cliente: existing, criado: false })
  try {
    const created = await prisma.cliente.create({
      data: { tenantId: actor.tenantId, nome, telefone: normalizePhone(telefone) }, select,
    })
    return caixaJson({ cliente: created, criado: true }, 201)
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const existing = await buscar(actor.tenantId, telefone)
    if (!existing) throw error
    return caixaJson({ cliente: existing, criado: false })
  }
}, { mutation: true })
