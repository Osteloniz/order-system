import { NextResponse } from 'next/server'

// Rota antiga de logout desativada. Use NextAuth (/api/auth).
export async function POST() {
  return NextResponse.json(
    { error: 'Rota desativada. Use /admin/login.' },
    { status: 410 }
  )
}
