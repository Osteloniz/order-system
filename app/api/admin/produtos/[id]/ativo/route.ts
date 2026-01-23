import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { produtos } from '@/lib/mock-db'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// PATCH /api/admin/produtos/:id/ativo - Toggle ativo/inativo
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const produtoIndex = produtos.findIndex(p => p.id === id)
    if (produtoIndex === -1) {
      return NextResponse.json(
        { error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    produtos[produtoIndex].ativo = body.ativo

    console.log(`[v0] Produto ${id} ativo: ${body.ativo}`)

    return NextResponse.json(produtos[produtoIndex])
  } catch (error) {
    console.error('[v0] Erro ao atualizar status do produto:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
