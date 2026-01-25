import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

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
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const categoria = await prisma.categoria.findUnique({ where: { id } })
    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoria nao encontrada' },
        { status: 404 }
      )
    }

    const categoriaAtualizada = await prisma.categoria.update({
      where: { id },
      data: {
        nome: body.nome ?? categoria.nome,
        ordem: body.ordem ?? categoria.ordem
      }
    })

    console.log(`[v0] Categoria atualizada: ${id}`)

    return NextResponse.json(categoriaAtualizada)
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
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const produtosCount = await prisma.produto.count({ where: { categoriaId: id } })
  if (produtosCount > 0) {
    return NextResponse.json(
      { error: 'Categoria possui produtos e nao pode ser removida' },
      { status: 400 }
    )
  }

  const categoria = await prisma.categoria.findUnique({ where: { id } })
  if (!categoria) {
    return NextResponse.json(
      { error: 'Categoria nao encontrada' },
      { status: 404 }
    )
  }

  await prisma.categoria.delete({ where: { id } })

  console.log(`[v0] Categoria removida: ${id}`)

  return NextResponse.json({ success: true })
}

