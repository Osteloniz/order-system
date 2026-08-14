import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { z } from 'zod'
import { getPendingAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { prisma } from '@/lib/db'
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotpCode,
} from '@/lib/totp'

export const runtime = 'nodejs'

const confirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
}).strict()

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

export async function GET() {
  const admin = await getPendingAdminSession()
  if (!admin) return noStoreJson({ error: 'Nao autorizado' }, { status: 401 })

  return noStoreJson({
    enabled: Boolean(admin.user.totpEnabledAt && admin.user.totpSecretEncrypted),
    enrollmentRequired: !admin.user.totpEnabledAt,
  })
}

export async function POST(request: NextRequest) {
  const admin = await getPendingAdminSession()
  if (!admin) return noStoreJson({ error: 'Nao autorizado' }, { status: 401 })
  if (admin.user.totpEnabledAt || admin.user.totpSecretEncrypted) {
    return noStoreJson({ error: 'Autenticador ja configurado' }, { status: 409 })
  }

  const email = admin.user.emailNormalizado || admin.user.email
  if (!email) return noStoreJson({ error: 'Conta sem e-mail autorizado' }, { status: 409 })

  const secret = generateTotpSecret()
  const uri = buildTotpUri({ email, secret })
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
    color: { dark: '#421C14', light: '#FFF8EE' },
  })
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.adminUser.update({
    where: { id: admin.user.id },
    data: {
      totpPendingSecretEncrypted: encryptTotpSecret(secret),
      totpPendingExpiresAt: expiresAt,
    },
  })

  await createAuthAuditLog({
    tenantId: admin.tenantId,
    adminUserId: admin.user.id,
    action: 'MFA_ENROLLMENT_STARTED',
    identifier: email,
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
    metadata: { expiresAt: expiresAt.toISOString() },
  })

  return noStoreJson({
    qrCodeDataUrl,
    manualKey: secret,
    expiresAt: expiresAt.toISOString(),
  })
}

export async function PUT(request: NextRequest) {
  const admin = await getPendingAdminSession()
  if (!admin) return noStoreJson({ error: 'Nao autorizado' }, { status: 401 })

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return noStoreJson({ error: 'Codigo invalido' }, { status: 400 })

  const pendingSecret = admin.user.totpPendingSecretEncrypted
  const pendingExpiresAt = admin.user.totpPendingExpiresAt
  if (!pendingSecret || !pendingExpiresAt || pendingExpiresAt.getTime() <= Date.now()) {
    return noStoreJson({ error: 'Configuracao expirada. Gere um novo QR Code.' }, { status: 410 })
  }

  let secret: string
  try {
    secret = decryptTotpSecret(pendingSecret)
  } catch {
    return noStoreJson({ error: 'Nao foi possivel validar a configuracao.' }, { status: 400 })
  }

  const matchedStep = verifyTotpCode(secret, parsed.data.code)
  if (matchedStep === null) {
    await createAuthAuditLog({
      tenantId: admin.tenantId,
      adminUserId: admin.user.id,
      action: 'MFA_CHALLENGE_FAILURE',
      identifier: admin.user.emailNormalizado,
      ipHash: hashIpAddress(getIp(request)),
      userAgent: request.headers.get('user-agent'),
      metadata: { reason: 'enrollment_confirmation_failed' },
    })
    return noStoreJson({ error: 'Codigo invalido ou expirado.' }, { status: 400 })
  }

  const recoveryCodes = generateRecoveryCodes()
  const activated = await prisma.adminUser.updateMany({
    where: {
      id: admin.user.id,
      totpEnabledAt: null,
      totpPendingSecretEncrypted: pendingSecret,
      totpPendingExpiresAt: { gt: new Date() },
    },
    data: {
      totpSecretEncrypted: pendingSecret,
      totpEnabledAt: new Date(),
      totpLastUsedStep: BigInt(matchedStep),
      recoveryCodeHashes: hashRecoveryCodes(recoveryCodes),
      totpPendingSecretEncrypted: null,
      totpPendingExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  })
  if (activated.count !== 1) {
    return noStoreJson({ error: 'Configuracao ja utilizada ou expirada.' }, { status: 409 })
  }

  await createAuthAuditLog({
    tenantId: admin.tenantId,
    adminUserId: admin.user.id,
    action: 'MFA_ENABLED',
    identifier: admin.user.emailNormalizado,
    ipHash: hashIpAddress(getIp(request)),
    userAgent: request.headers.get('user-agent'),
  })

  return noStoreJson({ success: true, recoveryCodes })
}
