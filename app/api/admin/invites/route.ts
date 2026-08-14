import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { createUserInvite } from '@/lib/user-invites'
import { sendAdminInviteEmail } from '@/lib/email'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const createInviteSchema = z.object({
  email: z.string().trim().email('E-mail invalido'),
}).strict()

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const [users, invites] = await Promise.all([
    prisma.adminUser.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, email: true, role: true, ativo: true, totpEnabledAt: true, criadoEm: true },
    }),
    prisma.userInvite.findMany({
      where: { tenantId: admin.tenantId, status: 'PENDING', usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
    }),
  ])
  return NextResponse.json({ isMaster: admin.user.role === 'MASTER', users, invites })
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }
  if (admin.user.role !== 'MASTER') {
    return NextResponse.json({ error: 'Somente o usuario master pode convidar administradores.' }, { status: 403 })
  }

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  try {
    const created = await createUserInvite({
      tenantId: admin.tenantId,
      email: parsed.data.email,
      createdBy: admin.adminUserId ?? null,
    })
    let delivery: Awaited<ReturnType<typeof sendAdminInviteEmail>>
    try {
      delivery = await sendAdminInviteEmail({
        to: created.invite.email,
        inviteLink: created.inviteLink,
        expiresAt: created.invite.expiresAt,
      })
    } catch (deliveryError) {
      await prisma.userInvite.update({
        where: { id: created.invite.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      })
      throw deliveryError
    }

    await createAuthAuditLog({
      tenantId: admin.tenantId,
      adminUserId: admin.adminUserId ?? null,
      inviteId: created.invite.id,
      action: 'INVITE_CREATED',
      identifier: created.invite.emailNormalizado,
      ipHash: hashIpAddress(getIp(request)),
      userAgent: request.headers.get('user-agent'),
      metadata: {
        expiresAt: created.invite.expiresAt.toISOString(),
      },
    })

    if (delivery.delivered) await createAuthAuditLog({
      tenantId: admin.tenantId,
      adminUserId: admin.adminUserId,
      inviteId: created.invite.id,
      action: 'INVITE_EMAIL_SENT',
      identifier: created.invite.emailNormalizado,
      ipHash: hashIpAddress(getIp(request)),
      userAgent: request.headers.get('user-agent'),
      metadata: { provider: 'resend', messageId: delivery.id || null },
    })

    return NextResponse.json({
      id: created.invite.id,
      email: created.invite.email,
      status: created.invite.status,
      expiresAt: created.invite.expiresAt.toISOString(),
      delivered: delivery.delivered,
      ...(process.env.NODE_ENV !== 'production' && !delivery.delivered
        ? { inviteLink: created.inviteLink, manualDelivery: true }
        : {}),
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar convite'
    const policyError = message === 'ADMIN_USER_LIMIT_REACHED'
    const status = message.includes('Ja existe um usuario') || policyError ? 409 : 500
    return NextResponse.json({
      error: policyError ? 'O limite seguro de usuarios foi atingido.' : message.startsWith('INVITE_EMAIL_') ? 'Nao foi possivel enviar o convite com seguranca.' : message,
    }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (admin.user.role !== 'MASTER') return NextResponse.json({ error: 'Somente o usuario master pode revogar convites.' }, { status: 403 })
  const parsed = z.object({ inviteId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Convite invalido.' }, { status: 400 })
  const revoked = await prisma.userInvite.updateMany({
    where: { id: parsed.data.inviteId, tenantId: admin.tenantId, status: 'PENDING', usedAt: null, revokedAt: null },
    data: { status: 'REVOKED', revokedAt: new Date() },
  })
  if (revoked.count !== 1) return NextResponse.json({ error: 'Convite indisponivel.' }, { status: 409 })
  await createAuthAuditLog({
    tenantId: admin.tenantId,
    adminUserId: admin.adminUserId,
    inviteId: parsed.data.inviteId,
    action: 'INVITE_REVOKED',
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
  })
  return NextResponse.json({ success: true })
}
