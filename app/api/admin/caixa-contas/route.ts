import { z } from 'zod'
import { prisma } from '@/lib/db'
import { caixaJson } from '@/lib/caixa-http'
import { caixaRoute } from '@/lib/caixa-route'
import { getAdminUsernamePolicyError, getPasswordPolicyError, normalizeAdminUsername } from '@/lib/admin-credential-policy'
import { hashPassword } from '@/lib/auth-security'

const conta = z.object({
  nome: z.string().trim().min(2).max(80),
  login: z.string().trim().refine((value) => !getAdminUsernamePolicyError(value), 'Login inválido.'),
  senha: z.string().refine((value) => !getPasswordPolicyError(value), 'Senha fora da política.'),
}).strict()
const estado = z.object({ id: z.string().uuid(), ativo: z.literal(false) }).strict()
const select = { id: true, nome: true, username: true, ativo: true } as const

export const GET = caixaRoute(async (_request, actor) => {
  if (actor.role !== 'MASTER') return caixaJson({ error: 'Acesso reservado ao responsável.' }, 403)
  return caixaJson(await prisma.adminUser.findMany({
    where: { tenantId: actor.tenantId, role: 'CAIXA' }, select, orderBy: { nome: 'asc' },
  }))
}, { admin: true })

export const POST = caixaRoute(async (request, actor) => {
  if (actor.role !== 'MASTER') return caixaJson({ error: 'Acesso reservado ao responsável.' }, 403)
  const { nome, login, senha } = conta.parse(await request.json())
  const passwordHash = await hashPassword(senha)
  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: { tenantId: actor.tenantId, role: 'CAIXA', nome, username: normalizeAdminUsername(login), passwordHash }, select,
    })
    await tx.authAuditLog.create({ data: { tenantId: actor.tenantId, adminUserId: actor.id,
      action: 'CAIXA_ACCOUNT_CHANGED', metadata: { operacao: 'CRIADA', contaId: user.id } } })
    return user
  })
  return caixaJson(user, 201)
}, { admin: true, mutation: true })

export const PATCH = caixaRoute(async (request, actor) => {
  if (actor.role !== 'MASTER') return caixaJson({ error: 'Acesso reservado ao responsável.' }, 403)
  const { id } = estado.parse(await request.json())
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.adminUser.updateMany({
      where: { id, tenantId: actor.tenantId, role: 'CAIXA', ativo: true },
      data: { ativo: false, sessionVersion: { increment: 1 } },
    })
    if (!updated.count) return false
    await tx.caixaSessao.deleteMany({ where: { adminUserId: id, tenantId: actor.tenantId } })
    await tx.authAuditLog.create({ data: { tenantId: actor.tenantId, adminUserId: actor.id,
      action: 'CAIXA_ACCOUNT_CHANGED', metadata: { operacao: 'DESATIVADA', contaId: id } } })
    return true
  })
  return changed ? caixaJson({ ok: true }) : caixaJson({ error: 'Conta ativa não encontrada.' }, 404)
}, { admin: true, mutation: true })
