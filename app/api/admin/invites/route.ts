import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { createUserInvite } from '@/lib/user-invites'

export const runtime = 'nodejs'

const createInviteSchema = z.object({
  email: z.string().trim().email('E-mail invalido'),
}).strict()

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
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

    return NextResponse.json({
      id: created.invite.id,
      email: created.invite.email,
      status: created.invite.status,
      expiresAt: created.invite.expiresAt.toISOString(),
      inviteLink: created.inviteLink,
      token: created.token,
      manualDelivery: process.env.NODE_ENV === 'production',
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar convite'
    const status = message.includes('Ja existe um usuario') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
