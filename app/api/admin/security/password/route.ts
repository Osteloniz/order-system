import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { getPasswordPolicyError, hashIpAddress, hashPassword, verifyPassword } from '@/lib/auth-security'
import { prisma } from '@/lib/db'
import { verifyAdminSecondFactor } from '@/lib/mfa-auth'

export const runtime = 'nodejs'

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
  code: z.string().trim().min(6).max(11),
}).strict()

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function PUT(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 })
  const policyError = getPasswordPolicyError(parsed.data.newPassword)
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

  const user = await prisma.adminUser.findUnique({ where: { id: admin.adminUserId } })
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Senha atual invalida.' }, { status: 401 })
  }
  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return NextResponse.json({ error: 'A nova senha deve ser diferente da atual.' }, { status: 400 })
  }

  const mfa = await verifyAdminSecondFactor(user, parsed.data.code)
  if (!mfa.valid) {
    await createAuthAuditLog({
      tenantId: admin.tenantId,
      adminUserId: user.id,
      action: 'MFA_CHALLENGE_FAILURE',
      identifier: user.emailNormalizado,
      ipHash: hashIpAddress(getIp(request)),
      userAgent: request.headers.get('user-agent'),
      metadata: { reason: 'password_change', detail: mfa.reason },
    })
    return NextResponse.json({ error: 'Codigo invalido, expirado ou ja utilizado.' }, { status: 400 })
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
  })
  await createAuthAuditLog({
    tenantId: admin.tenantId,
    adminUserId: user.id,
    action: 'PASSWORD_CHANGED',
    identifier: user.emailNormalizado,
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
    metadata: { sessionsRevoked: true, secondFactor: mfa.method },
  })
  return NextResponse.json({ success: true, sessionsRevoked: true })
}
