import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

// POST /api/tenant/select - define tenant via cookie
export async function POST(request: NextRequest) {
  const body = await request.json()
  const slug = String(body.slug || '').trim()
  if (!slug) {
    return NextResponse.json({ error: 'Slug invalido' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } })
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nao encontrado' }, { status: 404 })
  }

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
