import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { getPasswordPolicyError, hashIpAddress } from '@/lib/auth-security'
import { registerInvitedUser } from '@/lib/user-invites'

export const runtime = 'nodejs'

const registerInviteSchema = z.object({
  token: z.string().trim().min(20),
  nome: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
}).strict()

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function POST(request: NextRequest) {
  const parsed = registerInviteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  try {
    const policyError = getPasswordPolicyError(parsed.data.password)
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })
    const result = await registerInvitedUser(parsed.data)
    if (!result.valid) {
      return NextResponse.json({ error: 'Convite invalido ou indisponivel' }, { status: 400 })
    }

    const ipHash = hashIpAddress(getIp(request))
    if (result.created) await createAuthAuditLog({
      tenantId: result.user.tenantId,
      adminUserId: result.user.id,
      inviteId: result.invite.id,
      action: 'USER_CREATED',
      identifier: result.user.emailNormalizado ?? result.user.username,
      ipHash,
      userAgent: request.headers.get('user-agent'),
      metadata: {
        username: result.user.username,
      },
    })

    return NextResponse.json({
      success: true,
      username: result.user.username,
      email: result.user.email,
      stage: 'MFA',
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar usuario'
    const status =
      message === 'INVITE_NOT_AVAILABLE' || message === 'EMAIL_ALREADY_REGISTERED'
        || message === 'ADMIN_EMAIL_NOT_ALLOWED' || message === 'ADMIN_USER_LIMIT_REACHED'
        ? 409
        : 500

    return NextResponse.json({
      error:
        message === 'INVITE_NOT_AVAILABLE' || message === 'EMAIL_ALREADY_REGISTERED'
          || message === 'ADMIN_EMAIL_NOT_ALLOWED' || message === 'ADMIN_USER_LIMIT_REACHED'
          ? 'Convite invalido ou indisponivel'
          : 'Erro ao criar usuario',
    }, { status })
  }
}
