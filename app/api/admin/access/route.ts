import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_ACCESS_COOKIE,
  getAdminAccessCookieOptions,
  getAdminAccessCookieValue,
  isAdminAccessEnabled,
  isValidAdminAccessKey,
} from '@/lib/admin-access'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const accessKey = typeof body?.accessKey === 'string' ? body.accessKey : ''

  if (!isAdminAccessEnabled()) {
    return NextResponse.json({ error: 'Chave de acesso admin nao configurada.' }, { status: 503 })
  }

  if (!isValidAdminAccessKey(accessKey)) {
    return NextResponse.json({ error: 'Chave de acesso invalida.' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(ADMIN_ACCESS_COOKIE, getAdminAccessCookieValue(), getAdminAccessCookieOptions())
  return response
}
