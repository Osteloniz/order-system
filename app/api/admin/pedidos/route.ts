import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'

export const runtime = 'nodejs'

// Middleware de autenticacao
async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/pedidos?status=... - Lista pedidos
export async function GET(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') as StatusPedido | null

  const resultado = await prisma.pedido.findMany({
    where: status ? { status } : undefined,
    include: { itens: true },
    orderBy: { criadoEm: 'desc' }
  })

  return NextResponse.json(resultado)
}

