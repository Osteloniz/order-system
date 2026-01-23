import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { pedidos } from '@/lib/mock-db'
import type { StatusPedido } from '@/lib/types'

// Middleware de autenticação
async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/pedidos?status=... - Lista pedidos
export async function GET(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') as StatusPedido | null

  let resultado = [...pedidos]

  if (status) {
    resultado = resultado.filter(p => p.status === status)
  }

  // Ordenar por data de criação (mais recente primeiro)
  resultado.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())

  return NextResponse.json(resultado)
}
