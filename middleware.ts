import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { ADMIN_ACCESS_COOKIE, hasAdminAccessCookie, isAdminAccessEnabled } from '@/lib/admin-access'

function withSecurityHeaders(response: NextResponse, pathname = '') {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/auth')) {
    response.headers.set('Cache-Control', 'no-store, max-age=0')
  }
  return response
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const defaultTenantSlug = 'brookie-pregiato'

  if (isAdminAccessEnabled()) {
    const isAdminArea = pathname.startsWith('/admin')
    const isAdminAuthApi = pathname.startsWith('/api/auth')
    const isAccessScreen = pathname.startsWith('/admin-access')
    const hasPreAccess = await hasAdminAccessCookie(req.cookies.get(ADMIN_ACCESS_COOKIE)?.value)

    if ((isAdminArea || isAdminAuthApi) && !isAccessScreen && !hasPreAccess) {
      if (isAdminAuthApi) {
        return withSecurityHeaders(
          NextResponse.json({ error: 'Acesso admin bloqueado.' }, { status: 403 }),
          pathname,
        )
      }

      const accessUrl = new URL('/admin-access', req.url)
      return withSecurityHeaders(NextResponse.redirect(accessUrl), pathname)
    }
  }

  if (
    pathname.startsWith('/admin') &&
    !pathname.startsWith('/admin/login') &&
    !pathname.startsWith('/admin-access')
  ) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token',
    })
    if (!token) {
      const loginUrl = new URL('/admin/login', req.url)
      return withSecurityHeaders(NextResponse.redirect(loginUrl), pathname)
    }

    const isMfaSetup = pathname === '/admin/seguranca' || pathname.startsWith('/admin/seguranca/')
    if (!token.mfaVerified && !isMfaSetup) {
      const setupUrl = new URL('/admin/seguranca', req.url)
      return withSecurityHeaders(NextResponse.redirect(setupUrl), pathname)
    }
  }

  const response = NextResponse.next()
  if (req.cookies.get('tenant_slug')?.value !== defaultTenantSlug) {
    response.cookies.set('tenant_slug', defaultTenantSlug, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30
    })
  }

  return withSecurityHeaders(response, pathname)
}

export const config = {
  matcher: ['/(cliente)/:path*', '/admin-access', '/admin/:path*', '/api/:path*']
}
