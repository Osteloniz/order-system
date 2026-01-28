import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// POST /api/tenant/clear - remove tenant cookie
export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('tenant_slug', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0
  })
  return response
}
