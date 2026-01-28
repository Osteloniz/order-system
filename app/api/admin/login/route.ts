import { NextResponse } from 'next/server'

// Rota antiga de login desativada. Use NextAuth (/api/auth) com session cookie.
export async function POST() {
  return NextResponse.json(
    { error: 'Rota desativada. Use /admin/login.' },
    { status: 410 }
  )
}
