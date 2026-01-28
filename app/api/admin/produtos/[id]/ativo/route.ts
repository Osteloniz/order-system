import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// PATCH /api/admin/produtos/:id/ativo - Toggle ativo/inativo
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const produto = await prisma.produto.findFirst({ where: { id, tenantId: admin.tenantId } })
    if (!produto) {
      return NextResponse.json(
        { error: 'Produto nao encontrado' },
        { status: 404 }
      )
    }

    const produtoAtualizado = await prisma.produto.update({
      where: { id },
      data: { ativo: body.ativo }
    })

    console.log(`[v0] Produto ${id} ativo: ${body.ativo}`)

    return NextResponse.json(produtoAtualizado)
  } catch (error) {
    console.error('[v0] Erro ao atualizar status do produto:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
