import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_ACCESS_COOKIE,
  getAdminAccessCookieOptions,
  getAdminAccessCookieValue,
  isAdminAccessConfigured,
  isAdminAccessEnabled,
  isValidAdminAccessKey,
} from '@/lib/admin-access'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'
import { isPersistentlyAuthBlocked } from '@/lib/auth-throttle'
import { rateLimitAdminAccessByIp, resetAdminAccessRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const accessKey = typeof body?.accessKey === 'string' ? body.accessKey : ''

  if (!isAdminAccessEnabled() || !isAdminAccessConfigured()) {
    return NextResponse.json({ error: 'Chave de acesso admin nao configurada.' }, { status: 503 })
  }

  const ip = getIp(request)
  const ipHash = hashIpAddress(ip)
  const throttleIdentifier = `admin-pre-access:${ipHash}`
  const limitedInMemory = !rateLimitAdminAccessByIp(ip).allowed
  const limitedPersistently = await isPersistentlyAuthBlocked({ ipHash, identifier: throttleIdentifier })
  if (limitedInMemory || limitedPersistently) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }

  if (!(await isValidAdminAccessKey(accessKey))) {
    await createAuthAuditLog({
      action: 'LOGIN_FAILURE',
      identifier: throttleIdentifier,
      ipHash,
      userAgent: request.headers.get('user-agent'),
      metadata: { reason: 'invalid_admin_access_key' },
    })
    return NextResponse.json({ error: 'Credencial invalida.' }, { status: 401 })
  }

  resetAdminAccessRateLimit(ip)
  const response = NextResponse.json({ success: true })
  response.cookies.set(ADMIN_ACCESS_COOKIE, await getAdminAccessCookieValue(), getAdminAccessCookieOptions())
  return response
}
