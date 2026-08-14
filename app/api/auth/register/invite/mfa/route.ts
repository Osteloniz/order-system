import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { z } from 'zod'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { prisma } from '@/lib/db'
import { rateLimitByIdentifier, rateLimitByIp } from '@/lib/rateLimit'
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotpCode,
} from '@/lib/totp'
import { validateInviteToken } from '@/lib/user-invites'
import { resolveInviteStatus } from '@/lib/invite-status'

export const runtime = 'nodejs'

const startSchema = z.object({ token: z.string().trim().min(20) }).strict()
const confirmSchema = startSchema.extend({ code: z.string().trim().regex(/^\d{6}$/) }).strict()

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

export async function POST(request: NextRequest) {
  const parsed = startSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Convite invalido.' }, 400)
  const validation = await validateInviteToken(parsed.data.token)
  if (!validation.valid || validation.stage !== 'MFA' || !validation.user) {
    return json({ error: 'Conclua primeiro a definicao da senha.' }, 409)
  }
  const user = await prisma.adminUser.findUnique({ where: { id: validation.user.id } })
  if (!user || user.ativo) return json({ error: 'Convite indisponivel.' }, 409)

  const secret = generateTotpSecret()
  const expiresAt = new Date(Math.min(validation.invite.expiresAt.getTime(), Date.now() + 10 * 60 * 1000))
  const encrypted = encryptTotpSecret(secret)
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { totpPendingSecretEncrypted: encrypted, totpPendingExpiresAt: expiresAt },
  })
  const qrCodeDataUrl = await QRCode.toDataURL(buildTotpUri({ email: user.emailNormalizado || user.email || user.username, secret }), {
    errorCorrectionLevel: 'M', margin: 1, width: 280, color: { dark: '#421C14', light: '#FFF8EE' },
  })
  await createAuthAuditLog({
    tenantId: user.tenantId,
    adminUserId: user.id,
    inviteId: validation.invite.id,
    action: 'MFA_ENROLLMENT_STARTED',
    identifier: user.emailNormalizado,
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
    metadata: { source: 'invite', expiresAt: expiresAt.toISOString() },
  })
  return json({ qrCodeDataUrl, manualKey: secret, expiresAt: expiresAt.toISOString() })
}

export async function PUT(request: NextRequest) {
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Codigo invalido.' }, 400)
  const validation = await validateInviteToken(parsed.data.token)
  if (!validation.valid || validation.stage !== 'MFA' || !validation.user) return json({ error: 'Convite indisponivel.' }, 409)

  const ip = getIp(request)
  const byIp = rateLimitByIp(ip)
  const byInvite = rateLimitByIdentifier(ip, `invite:${validation.invite.id}`)
  if (!byIp.allowed || !byInvite.allowed) return json({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429)

  const user = await prisma.adminUser.findUnique({ where: { id: validation.user.id } })
  if (!user || user.ativo || !user.totpPendingSecretEncrypted || !user.totpPendingExpiresAt || user.totpPendingExpiresAt <= new Date()) {
    return json({ error: 'Configuracao expirada. Gere um novo QR Code.' }, 410)
  }
  let secret: string
  try {
    secret = decryptTotpSecret(user.totpPendingSecretEncrypted)
  } catch {
    return json({ error: 'Nao foi possivel validar a configuracao.' }, 400)
  }
  const step = verifyTotpCode(secret, parsed.data.code)
  if (step === null) {
    await createAuthAuditLog({
      tenantId: user.tenantId, adminUserId: user.id, inviteId: validation.invite.id,
      action: 'MFA_CHALLENGE_FAILURE', identifier: user.emailNormalizado,
      ipHash: hashIpAddress(ip), userAgent: request.headers.get('user-agent'),
      metadata: { source: 'invite_activation' },
    })
    return json({ error: 'Codigo invalido ou expirado.' }, 400)
  }

  const recoveryCodes = generateRecoveryCodes()
  await prisma.$transaction(async tx => {
    const invite = await tx.userInvite.findUnique({ where: { id: validation.invite.id } })
    if (!invite || resolveInviteStatus(invite) !== 'PENDING') throw new Error('INVITE_NOT_AVAILABLE')
    const activated = await tx.adminUser.updateMany({
      where: {
        id: user.id,
        ativo: false,
        totpPendingSecretEncrypted: user.totpPendingSecretEncrypted,
        totpPendingExpiresAt: { gt: new Date() },
      },
      data: {
        ativo: true,
        totpSecretEncrypted: user.totpPendingSecretEncrypted,
        totpEnabledAt: new Date(),
        totpLastUsedStep: BigInt(step),
        recoveryCodeHashes: hashRecoveryCodes(recoveryCodes),
        totpPendingSecretEncrypted: null,
        totpPendingExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    })
    if (activated.count !== 1) throw new Error('USER_ALREADY_ACTIVATED')
    await tx.userInvite.update({
      where: { id: invite.id },
      data: { status: 'USED', usedAt: new Date() },
    })
  })

  const auditBase = {
    tenantId: user.tenantId,
    adminUserId: user.id,
    inviteId: validation.invite.id,
    identifier: user.emailNormalizado,
    ipHash: hashIpAddress(ip),
    userAgent: request.headers.get('user-agent'),
  }
  await createAuthAuditLog({ ...auditBase, action: 'MFA_ENABLED', metadata: { source: 'invite' } })
  await createAuthAuditLog({ ...auditBase, action: 'USER_ACTIVATED' })
  await createAuthAuditLog({ ...auditBase, action: 'INVITE_USED' })
  return json({ success: true, email: user.email, recoveryCodes })
}
