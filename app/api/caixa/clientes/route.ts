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

const busca = z.string().trim().min(2, 'Digite pelo menos duas letras do nome ou o telefone.').max(80)
const acentos = 'áàãâäéèêëíìîïóòõôöúùûüçñ'
const semAcentos = 'aaaaaeeeeiiiiooooouuuucn'

async function buscarPorNome(tenantId: string, nome: string) {
  const palavras = nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/\s+/).filter(Boolean)
  if (!palavras.length) return []
  const caracteresAcentuados = acentos + acentos.toUpperCase()
  const transliteracao = semAcentos.repeat(2)
  const partes = palavras.map((palavra) =>
    Prisma.sql`strpos(lower(translate("nome", ${caracteresAcentuados}, ${transliteracao})), ${palavra}) > 0`)
  return prisma.$queryRaw<{ id: string; nome: string; telefone: string | null }[]>`
    SELECT "id", "nome", "telefone" FROM "Cliente"
    WHERE "tenantId" = ${tenantId} AND ${Prisma.join(partes, ' AND ')}
    ORDER BY "nome", "id"
    LIMIT 8
  `
}

export const GET = caixaRoute(async (request, actor) => {
  const query = request.nextUrl.searchParams.get('q')
  if (query !== null) {
    const termo = busca.parse(query)
    const porTelefone = /^[0-9+()\s.-]+$/.test(termo)
    if (porTelefone && !isValidPhone(termo)) {
      return caixaJson({ error: 'Informe um telefone completo ou busque pelo nome.' }, 400)
    }
    const encontrado = porTelefone ? await buscar(actor.tenantId, termo) : null
    const clientes = porTelefone ? (encontrado ? [encontrado] : []) : await buscarPorNome(actor.tenantId, termo)
    return caixaJson({
      clientes: clientes.map(({ id, nome, telefone }) => ({ id, nome, telefoneFinal: isValidPhone(telefone) ? normalizePhone(telefone).slice(-4) : null })),
      cadastroRapidoTelefone: porTelefone && !encontrado ? normalizePhone(termo) : null,
    })
  }
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
