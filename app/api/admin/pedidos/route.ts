import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// Middleware de autenticacao
// GET /api/admin/pedidos?status=... - Lista pedidos
export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') as StatusPedido | null

  const resultado = await prisma.pedido.findMany({
    where: status ? { status, tenantId: admin.tenantId } : { tenantId: admin.tenantId },
    include: { itens: true },
    orderBy: { criadoEm: 'desc' }
  })

  return NextResponse.json(resultado)
}
