import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { CAIXA_COOKIE, CAIXA_IDLE_MS, CAIXA_SHIFT_MS, caixaSessionWindow } from '@/lib/caixa-session-policy'

export type CaixaActor = { id: string; tenantId: string; role: 'CAIXA' | 'MASTER' | 'ADMIN' }

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function newCaixaSession(user: { id: string; tenantId: string; sessionVersion: number }, ipHash: string, identifier: string) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiraEm = new Date(now.getTime() + CAIXA_SHIFT_MS)
  await prisma.$transaction([
    prisma.caixaSessao.deleteMany({ where: { expiraEm: { lte: now } } }),
    prisma.caixaSessao.create({
      data: { tokenHash: tokenHash(token), adminUserId: user.id, tenantId: user.tenantId,
        sessionVersion: user.sessionVersion, expiraEm, atividadeEm: now },
    }),
    prisma.authAuditLog.create({
      data: { tenantId: user.tenantId, adminUserId: user.id, action: 'LOGIN_SUCCESS', ipHash, identifier,
        metadata: { role: 'CAIXA' } },
    }),
  ])
  const jar = await cookies()
  for (const cookie of jar.getAll()) {
    if (/^next-auth\.session-token(?:\.\d+)?$/.test(cookie.name)) jar.delete(cookie.name)
  }
  jar.set(CAIXA_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiraEm,
  })
}

export async function getCaixaActor(activity = false): Promise<CaixaActor | null> {
  const token = (await cookies()).get(CAIXA_COOKIE)?.value
  if (!token) {
    const admin = await getAdminSession()
    if (!admin || admin.user.role === 'CAIXA') return null
    return { id: admin.adminUserId, tenantId: admin.tenantId, role: admin.user.role }
  }

  const hash = tokenHash(token)
  const session = await prisma.caixaSessao.findUnique({
    where: { tokenHash: hash },
    include: { adminUser: { select: { ativo: true, tenantId: true, role: true, sessionVersion: true } } },
  })
  const now = new Date()
  if (!session || !caixaSessionWindow(now, session) ||
      !session.adminUser.ativo || session.adminUser.role !== 'CAIXA' ||
      session.adminUser.tenantId !== session.tenantId || session.adminUser.sessionVersion !== session.sessionVersion) {
    return null
  }

  if (activity) {
    const updated = await prisma.caixaSessao.updateMany({
      where: { tokenHash: hash, expiraEm: { gt: now }, atividadeEm: { gt: new Date(now.getTime() - CAIXA_IDLE_MS), lte: now },
        adminUser: { ativo: true, role: 'CAIXA', tenantId: session.tenantId, sessionVersion: session.sessionVersion } },
      data: { atividadeEm: now },
    })
    // A concurrent activity may have written a newer timestamp. Validate without moving it backwards.
    if (!updated.count) return getCaixaActor()
  }

  return { id: session.adminUserId, tenantId: session.tenantId, role: 'CAIXA' }
}

export async function endCaixaSession() {
  const jar = await cookies()
  const token = jar.get(CAIXA_COOKIE)?.value
  if (token) {
    await prisma.$transaction(async (tx) => {
      const session = await tx.caixaSessao.findUnique({ where: { tokenHash: tokenHash(token) } })
      if (!session) return
      const deleted = await tx.caixaSessao.deleteMany({ where: { tokenHash: session.tokenHash } })
      if (deleted.count) await tx.authAuditLog.create({
        data: { action: 'LOGOUT', tenantId: session.tenantId, adminUserId: session.adminUserId, metadata: { role: 'CAIXA' } },
      })
    })
  }
  jar.delete(CAIXA_COOKIE)
}
