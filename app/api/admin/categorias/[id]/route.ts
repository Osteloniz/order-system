import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { categorias } from '@/lib/mock-db'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// PUT /api/admin/categorias/:id - Atualiza categoria
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const categoriaIndex = categorias.findIndex(c => c.id === id)
    if (categoriaIndex === -1) {
      return NextResponse.json(
        { error: 'Categoria não encontrada' },
        { status: 404 }
      )
    }

    categorias[categoriaIndex] = {
      ...categorias[categoriaIndex],
      nome: body.nome ?? categorias[categoriaIndex].nome,
      ordem: body.ordem ?? categorias[categoriaIndex].ordem
    }

    console.log(`[v0] Categoria atualizada: ${id}`)

    return NextResponse.json(categorias[categoriaIndex])
  } catch (error) {
    console.error('[v0] Erro ao atualizar categoria:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar categoria' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/categorias/:id - Remove categoria
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const categoriaIndex = categorias.findIndex(c => c.id === id)
  
  if (categoriaIndex === -1) {
    return NextResponse.json(
      { error: 'Categoria não encontrada' },
      { status: 404 }
    )
  }

  categorias.splice(categoriaIndex, 1)

  console.log(`[v0] Categoria removida: ${id}`)

  return NextResponse.json({ success: true })
}
