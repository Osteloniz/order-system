import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth-helpers'
import { createAuthAuditLog } from '@/lib/auth-audit'
import { hashIpAddress } from '@/lib/auth-security'

export const runtime = 'nodejs'

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  const sessionUser = admin?.session.user
  if (admin?.tenantId) {
    await createAuthAuditLog({
      tenantId: admin.tenantId,
      adminUserId: admin.adminUserId ?? null,
      action: 'LOGOUT',
      identifier: sessionUser?.email ?? sessionUser?.name ?? null,
      ipHash: hashIpAddress(getIp(request)),
      userAgent: request.headers.get('user-agent'),
    })
  }

  return NextResponse.json({ success: true })
}
