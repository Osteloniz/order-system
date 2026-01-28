import { NextResponse } from 'next/server'

// Rota antiga de sessão desativada. Use NextAuth (/api/auth).
export async function GET() {
  return NextResponse.json(
    { error: 'Rota desativada. Use /admin/login.' },
    { status: 410 }
  )
}
