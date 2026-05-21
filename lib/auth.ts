import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { ADMIN_ACCESS_COOKIE, hasAdminAccessCookie, isAdminAccessEnabled } from '@/lib/admin-access'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress, normalizeEmail, normalizeLoginIdentifier, verifyPassword } from '@/lib/auth-security'
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
    maxAge: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        if (isAdminAccessEnabled()) {
          const accessCookie = getCookieValue(req?.headers, ADMIN_ACCESS_COOKIE)
          if (!hasAdminAccessCookie(accessCookie)) {
            throw new Error('Acesso admin bloqueado.')
          }
        }

        const forwardedFor = getHeaderValue(req?.headers, 'x-forwarded-for')
        const realIp = getHeaderValue(req?.headers, 'x-real-ip')
        const ip = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

        const identifier = normalizeLoginIdentifier(credentials?.username?.toString() || '')
        const password = credentials?.password?.toString()
        const rateByIp = rateLimitByIp(ip)
        const rateByIdentifier = identifier ? rateLimitByIdentifier(ip, identifier) : { allowed: true }

        if (!rateByIp.allowed || !rateByIdentifier.allowed) {
          await createAuthAuditLog({
            action: 'LOGIN_FAILURE',
            identifier: identifier || null,
            ipHash: hashIpAddress(ip),
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'rate_limited' },
          })
          throw new Error('Muitas tentativas. Tente novamente mais tarde.')
        }

        if (!identifier || !password) {
          return null
        }

        const tenant = await prisma.tenant.findUnique({
          where: { slug: 'brookie-pregiato' }
        })
        if (!tenant) {
          return null
        }

        const user = await prisma.adminUser.findFirst({
          where: {
            tenantId: tenant.id,
            OR: [
              { username: identifier },
              { emailNormalizado: normalizeEmail(identifier) },
            ],
          }
        })
        if (!user) {
          await createAuthAuditLog({
            tenantId: tenant.id,
            action: 'LOGIN_FAILURE',
            identifier,
            ipHash: hashIpAddress(ip),
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'user_not_found' },
          })
          return null
        }

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) {
          await createAuthAuditLog({
            tenantId: tenant.id,
            adminUserId: user.id,
            action: 'LOGIN_FAILURE',
            identifier,
            ipHash: hashIpAddress(ip),
            userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
            metadata: { reason: 'invalid_password' },
          })
          return null
        }

        resetRateLimitByIp(ip)
        resetRateLimitByIdentifier(ip, identifier)

        await createAuthAuditLog({
          tenantId: tenant.id,
          adminUserId: user.id,
          action: 'LOGIN_SUCCESS',
          identifier,
          ipHash: hashIpAddress(ip),
          userAgent: getHeaderValue(req?.headers, 'user-agent') || null,
        })

        return {
          id: user.id,
          name: user.nome,
          email: user.email ?? undefined,
          tenantId: tenant.id,
          tenantSlug: tenant.slug
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
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  }
}
