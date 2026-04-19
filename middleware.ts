import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const defaultTenantSlug = 'brookie-pregiato'
  
  // Garante que o cookie de tenant sempre aponta para o tenant unico atual.
  if (req.cookies.get('tenant_slug')?.value !== defaultTenantSlug) {
    const response = NextResponse.next()
    response.cookies.set('tenant_slug', defaultTenantSlug, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30
    })
    return withSecurityHeaders(response)
  }

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token',
    })
    if (!token) {
      const loginUrl = new URL('/admin/login', req.url)
      return withSecurityHeaders(NextResponse.redirect(loginUrl))
    }
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/(cliente)/:path*', '/admin/:path*', '/api/:path*']
}
