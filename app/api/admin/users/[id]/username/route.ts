import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import {
  getAdminUsernamePolicyError,
  hashIpAddress,
  normalizeAdminUsername,
  verifyPassword,
} from '@/lib/auth-security'
import { prisma } from '@/lib/db'
import { verifyAdminSecondFactor } from '@/lib/mfa-auth'

export const runtime = 'nodejs'

const schema = z.object({
  username: z.string().trim().min(3).max(40),
  currentPassword: z.string().min(1).max(128),
  code: z.string().trim().min(6).max(11),
}).strict()

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id } = await context.params
  if (admin.user.role !== 'MASTER' && admin.adminUserId !== id) {
    return NextResponse.json({ error: 'Sem permissao para alterar este usuario.' }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 })
  const username = normalizeAdminUsername(parsed.data.username)
  const usernameError = getAdminUsernamePolicyError(username)
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 })

  const [actor, target] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: admin.adminUserId } }),
    prisma.adminUser.findFirst({ where: { id, tenantId: admin.tenantId } }),
  ])
  if (!actor || !target) return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 })
  if (!(await verifyPassword(parsed.data.currentPassword, actor.passwordHash))) {
    return NextResponse.json({ error: 'Senha atual invalida.' }, { status: 401 })
  }
  if (target.username === username) {
    return NextResponse.json({ success: true, username, sessionsRevoked: false })
  }
  const duplicate = await prisma.adminUser.findFirst({
    where: {
      tenantId: admin.tenantId,
      id: { not: target.id },
      username: { equals: username, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (duplicate) return NextResponse.json({ error: 'Este login ja esta em uso.' }, { status: 409 })
  const secondFactor = await verifyAdminSecondFactor(actor, parsed.data.code)
  if (!secondFactor.valid) {
    return NextResponse.json({ error: 'Codigo invalido, expirado ou ja utilizado.' }, { status: 400 })
  }

  await prisma.adminUser.update({
    where: { id: target.id },
    data: { username, sessionVersion: { increment: 1 } },
  })
  await createAuthAuditLog({
    tenantId: admin.tenantId,
    adminUserId: actor.id,
    action: 'USERNAME_CHANGED',
    identifier: actor.emailNormalizado || actor.username,
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
    metadata: {
      targetUserId: target.id,
      previousUsername: target.username,
      newUsername: username,
      targetSessionsRevoked: true,
      secondFactor: secondFactor.method,
    },
  })

  return NextResponse.json({ success: true, username, sessionsRevoked: true })
}
