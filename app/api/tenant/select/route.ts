import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// POST /api/tenant/select - sempre seleciona Brookie Pregiato (single-tenant)
export async function POST(request: NextRequest) {
  // Force Brookie Pregiato como único tenant
  const slug = 'brookie-pregiato'

  const response = NextResponse.json({ success: true })
  response.cookies.set('tenant_slug', slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30
  })
  return response
}
