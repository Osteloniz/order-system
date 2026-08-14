import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_ACCESS_COOKIE, hasAdminAccessCookie, isAdminAccessEnabled } from '@/lib/admin-access'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { isAuthSecurityConfigurationReady } from '@/lib/auth-config'
import { hashIpAddress, normalizeAdminUsername, normalizeEmail, verifyPassword } from '@/lib/auth-security'
import { isPersistentlyAuthBlocked } from '@/lib/auth-throttle'
import { prisma } from '@/lib/db'
import {
  ADMIN_MFA_CHALLENGE_COOKIE,
  ADMIN_MFA_CHALLENGE_MAX_AGE_SECONDS,
  createAdminMfaChallenge,
  hashUserAgent,
  readAdminMfaChallenge,
} from '@/lib/login-challenge'
import { rateLimitByIdentifier, rateLimitByIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const schema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
}).strict()

const DUMMY_PASSWORD_HASH = '$2a$12$Gz0ovJNY3tkQPVbTI5NLzOStyTtv/kCkFOP6TM3uKmPh1jkpkSdhu'

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

export async function POST(request: NextRequest) {
  if (isAdminAccessEnabled() && !(await hasAdminAccessCookie(request.cookies.get(ADMIN_ACCESS_COOKIE)?.value))) {
    return json({ error: 'Acesso admin bloqueado.' }, 403)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'E-mail, login ou senha invalidos.' }, 400)
  if (process.env.NODE_ENV === 'production' && !isAuthSecurityConfigurationReady()) {
    return json({ error: 'Acesso temporariamente indisponivel.' }, 503)
  }

  const rawIdentifier = parsed.data.identifier
  const isEmail = rawIdentifier.includes('@')
  const identifier = isEmail ? normalizeEmail(rawIdentifier) : normalizeAdminUsername(rawIdentifier)
  const ip = getIp(request)
  const ipHash = hashIpAddress(ip)
  const userAgent = request.headers.get('user-agent')
  const byIp = rateLimitByIp(ip)
  const byIdentifier = rateLimitByIdentifier(ip, identifier)
  const blocked = await isPersistentlyAuthBlocked({ ipHash, identifier })
  if (!byIp.allowed || !byIdentifier.allowed || blocked) {
    await createAuthAuditLog({ action: 'LOGIN_FAILURE', identifier, ipHash, userAgent, metadata: { reason: 'rate_limited_password_step' } })
    return json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429)
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'brookie-pregiato' } })
  const user = tenant ? await prisma.adminUser.findFirst({
    where: {
      tenantId: tenant.id,
      ...(isEmail
        ? { emailNormalizado: identifier }
        : { username: { equals: identifier, mode: 'insensitive' as const } }),
    },
  }) : null
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash || DUMMY_PASSWORD_HASH)

  if (!tenant || !user || !user.ativo || !passwordOk) {
    await createAuthAuditLog({
      tenantId: tenant?.id,
      adminUserId: user?.id,
      action: 'LOGIN_FAILURE',
      identifier,
      ipHash,
      userAgent,
      metadata: { reason: 'invalid_password_step' },
    })
    return json({ error: 'E-mail, login ou senha invalidos.' }, 401)
  }

  if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
    return json({ error: 'Esta conta ainda nao concluiu a configuracao do autenticador.' }, 409)
  }

  const challenge = createAdminMfaChallenge({
    userId: user.id,
    tenantId: tenant.id,
    sessionVersion: user.sessionVersion,
    identifier,
    ipHash,
    userAgentHash: hashUserAgent(userAgent),
  })
  await createAuthAuditLog({
    tenantId: tenant.id,
    adminUserId: user.id,
    action: 'PASSWORD_CHALLENGE_SUCCESS',
    identifier,
    ipHash,
    userAgent,
  })

  const loginHint = isEmail ? identifier.replace(/^(.{2}).*(@.*)$/, '$1***$2') : user.username
  const response = json({ success: true, loginHint })
  response.cookies.set(ADMIN_MFA_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_MFA_CHALLENGE_MAX_AGE_SECONDS,
  })
  return response
}

export async function GET(request: NextRequest) {
  const challenge = readAdminMfaChallenge(request.cookies.get(ADMIN_MFA_CHALLENGE_COOKIE)?.value)
  if (!challenge) return json({ valid: false }, 401)
  const ipHash = hashIpAddress(getIp(request))
  const valid = challenge.ipHash === ipHash
    && challenge.userAgentHash === hashUserAgent(request.headers.get('user-agent'))
  if (!valid) return json({ valid: false }, 401)
  return json({
    valid: true,
    loginHint: challenge.identifier.includes('@')
      ? challenge.identifier.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      : challenge.identifier,
    expiresAt: challenge.expiresAt,
  })
}

export async function DELETE() {
  const response = json({ success: true })
  response.cookies.set(ADMIN_MFA_CHALLENGE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
