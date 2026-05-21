import { NextRequest, NextResponse } from 'next/server'
import { validateInviteToken } from '@/lib/user-invites'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim() || ''
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'INVALID' }, { status: 400 })
  }

  const validation = await validateInviteToken(token)
  if (!validation.valid) {
    return NextResponse.json({
      valid: false,
      reason: validation.reason,
    }, { status: 200 })
  }

  return NextResponse.json({
    valid: true,
    emailHint: validation.emailHint,
    expiresAt: validation.invite.expiresAt.toISOString(),
  })
}
