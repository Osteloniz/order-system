import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Health-check simples para validar conexao com o banco.
export async function GET() {
  try {
    // Query leve: apenas confirma que o banco responde.
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[health/db] Falha ao conectar:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
