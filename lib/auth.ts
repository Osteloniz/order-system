import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimitByIp } from '@/lib/rateLimit'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        tenant: { label: 'Tenant', type: 'text' },
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        const forwardedFor = req?.headers?.get?.('x-forwarded-for')?.toString()
        const realIp = req?.headers?.get?.('x-real-ip')?.toString()
        const ip = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

        const rate = rateLimitByIp(ip)
        if (!rate.allowed) {
          throw new Error('Muitas tentativas. Tente novamente mais tarde.')
        }

        const tenantSlug = credentials?.tenant?.toString().trim()
        const username = credentials?.username?.toString().trim()
        const password = credentials?.password?.toString()

        if (!tenantSlug || !username || !password) {
          return null
        }

        const tenant = await prisma.tenant.findUnique({
          where: { slug: tenantSlug }
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
