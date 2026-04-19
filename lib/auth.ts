import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimitByIp, resetRateLimitByIp } from '@/lib/rateLimit'

function getHeaderValue(headers: unknown, name: string) {
  if (!headers) return undefined

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)?.toString()
  }

  const value = (headers as Record<string, unknown>)[name]
  return Array.isArray(value) ? value[0]?.toString() : value?.toString()
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        const forwardedFor = getHeaderValue(req?.headers, 'x-forwarded-for')
        const realIp = getHeaderValue(req?.headers, 'x-real-ip')
        const ip = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

        const rate = rateLimitByIp(ip)
        if (!rate.allowed) {
          throw new Error('Muitas tentativas. Tente novamente mais tarde.')
        }

        const username = credentials?.username?.toString().trim()
        const password = credentials?.password?.toString()

        if (!username || !password) {
          return null
        }

        // Force Brookie Pregiato como único tenant
        const tenant = await prisma.tenant.findUnique({
          where: { slug: 'brookie-pregiato' }
        })
        if (!tenant) {
          return null
        }

        const user = await prisma.adminUser.findFirst({
          where: { tenantId: tenant.id, username }
        })
        if (!user) {
          return null
        }

        const ok = await compare(password, user.passwordHash)
        if (!ok) {
          return null
        }

        resetRateLimitByIp(ip)

        return {
          id: user.id,
          name: user.nome,
          tenantId: tenant.id,
          tenantSlug: tenant.slug
        } as any
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as any).tenantId
        token.tenantSlug = (user as any).tenantSlug
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
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
