import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { ADMIN_ACCESS_COOKIE, hasAdminAccessCookie, isAdminAccessEnabled } from '@/lib/admin-access'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { isPersistentlyAuthBlocked } from '@/lib/auth-throttle'
import { verifyAdminSecondFactor } from '@/lib/mfa-auth'
import { isAuthSecurityConfigurationReady } from '@/lib/auth-config'
import { ADMIN_MFA_CHALLENGE_COOKIE, hashUserAgent, readAdminMfaChallenge } from '@/lib/login-challenge'
import { rateLimitByIdentifier, rateLimitByIp, resetRateLimitByIdentifier, resetRateLimitByIp } from '@/lib/rateLimit'

function getHeaderValue(headers: unknown, name: string) {
  if (!headers) return undefined

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)?.toString()
  }

  const value = (headers as Record<string, unknown>)[name]
  return Array.isArray(value) ? value[0]?.toString() : value?.toString()
}

function getCookieValue(headers: unknown, name: string) {
  const cookieHeader = getHeaderValue(headers, 'cookie')
  if (!cookieHeader) return undefined

  const entry = cookieHeader
    .split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${name}=`))

  return entry?.slice(name.length + 1)
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 4,
    updateAge: 60 * 15,
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        flow: { label: 'Fluxo', type: 'text' },
        code: { label: 'Codigo de seguranca', type: 'text' },
      },
      async authorize(credentials, req) {
        if (isAdminAccessEnabled()) {
          const accessCookie = getCookieValue(req?.headers, ADMIN_ACCESS_COOKIE)
          if (!(await hasAdminAccessCookie(accessCookie))) {
            throw new Error('Acesso admin bloqueado.')
          }
        }

        const forwardedFor = getHeaderValue(req?.headers, 'x-forwarded-for')
        const realIp = getHeaderValue(req?.headers, 'x-real-ip')
        const ip = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

        if (credentials?.flow?.toString() !== 'mfa') return null
        const challenge = readAdminMfaChallenge(getCookieValue(req?.headers, ADMIN_MFA_CHALLENGE_COOKIE))
        if (!challenge) return null

        const identifier = challenge.identifier
        const secondFactor = credentials?.code?.toString()
        const ipHash = hashIpAddress(ip)
        const rateByIp = rateLimitByIp(ip)
        const rateByIdentifier = identifier ? rateLimitByIdentifier(ip, identifier) : { allowed: true }
        const persistentlyBlocked = await isPersistentlyAuthBlocked({ ipHash, identifier })

        if (!rateByIp.allowed || !rateByIdentifier.allowed || persistentlyBlocked) {
          await createAuthAuditLog({
            action: 'LOGIN_FAILURE',
            identifier: identifier || null,
            ipHash,
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'rate_limited' },
          })
          throw new Error('Muitas tentativas. Tente novamente mais tarde.')
        }

        if (!identifier || !identifier.includes('@')) {
          return null
        }

        if (process.env.NODE_ENV === 'production' && !isAuthSecurityConfigurationReady()) {
          await createAuthAuditLog({
            action: 'LOGIN_FAILURE',
            identifier,
            ipHash,
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'auth_security_configuration_not_ready' },
          })
          return null
        }

        if (challenge.ipHash !== ipHash || challenge.userAgentHash !== hashUserAgent(getHeaderValue(req?.headers, 'user-agent'))) {
          return null
        }

        const tenant = await prisma.tenant.findFirst({
          where: { id: challenge.tenantId, slug: 'brookie-pregiato' }
        })
        if (!tenant) {
          return null
        }

        const user = await prisma.adminUser.findFirst({
          where: {
            id: challenge.userId,
            tenantId: tenant.id,
            emailNormalizado: identifier,
            sessionVersion: challenge.sessionVersion,
          }
        })
        if (!user || !user.ativo) {
          await createAuthAuditLog({
            tenantId: tenant.id,
            adminUserId: user?.id ?? null,
            action: 'LOGIN_FAILURE',
            identifier,
            ipHash,
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'invalid_or_expired_mfa_challenge' },
          })
          return null
        }

        const mfaResult = await verifyAdminSecondFactor(user, secondFactor)
        if (!mfaResult.valid) {
          await createAuthAuditLog({
            tenantId: tenant.id,
            adminUserId: user.id,
            action: 'MFA_CHALLENGE_FAILURE',
            identifier,
            ipHash,
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: mfaResult.reason },
          })
          await createAuthAuditLog({
            tenantId: tenant.id,
            adminUserId: user.id,
            action: 'LOGIN_FAILURE',
            identifier,
            ipHash,
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'invalid_second_factor' },
          })
          return null
        }

        resetRateLimitByIp(ip)
        resetRateLimitByIdentifier(ip, identifier)

        await createAuthAuditLog({
          tenantId: tenant.id,
          adminUserId: user.id,
          action: mfaResult.method === 'recovery' ? 'MFA_RECOVERY_CODE_USED' : 'MFA_CHALLENGE_SUCCESS',
          identifier,
          ipHash,
          userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
        })

        await createAuthAuditLog({
          tenantId: tenant.id,
          adminUserId: user.id,
          action: 'LOGIN_SUCCESS',
          identifier,
          ipHash,
          userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
        })

        return {
          id: user.id,
          name: user.nome,
          email: user.email ?? undefined,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          sessionVersion: user.sessionVersion,
          role: user.role,
          mfaVerified: true,
          mfaEnrollmentRequired: false,
        } as any
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.email = (user as any).email
        token.tenantId = (user as any).tenantId
        token.tenantSlug = (user as any).tenantSlug
        token.sessionVersion = (user as any).sessionVersion
        token.role = (user as any).role
        token.mfaVerified = Boolean((user as any).mfaVerified)
        token.mfaEnrollmentRequired = Boolean((user as any).mfaEnrollmentRequired)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id
        if (token.email) {
          session.user.email = String(token.email)
        }
        ;(session.user as any).tenantId = token.tenantId
        ;(session.user as any).tenantSlug = token.tenantSlug
        ;(session.user as any).sessionVersion = token.sessionVersion
        ;(session.user as any).role = token.role
        ;(session.user as any).mfaVerified = Boolean(token.mfaVerified)
        ;(session.user as any).mfaEnrollmentRequired = Boolean(token.mfaEnrollmentRequired)
      }
      return session
    }
  },
  pages: {
    signIn: '/admin/login'
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  }
}
