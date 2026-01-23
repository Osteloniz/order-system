import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { produtos } from '@/lib/mock-db'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// PUT /api/admin/produtos/:id - Atualiza produto
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

    const produtoIndex = produtos.findIndex(p => p.id === id)
    if (produtoIndex === -1) {
      return NextResponse.json(
        { error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    const imagens = Array.isArray(body.imagens)
      ? body.imagens.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
      : undefined

    produtos[produtoIndex] = {
      ...produtos[produtoIndex],
      nome: body.nome ?? produtos[produtoIndex].nome,
      descricao: body.descricao ?? produtos[produtoIndex].descricao,
      categoriaId: body.categoriaId ?? produtos[produtoIndex].categoriaId,
      preco: body.preco !== undefined ? Math.round(body.preco) : produtos[produtoIndex].preco,
      imagemUrl: body.imagemUrl ?? produtos[produtoIndex].imagemUrl,
      imagens: imagens ?? produtos[produtoIndex].imagens,
      ativo: body.ativo ?? produtos[produtoIndex].ativo,
      ordem: body.ordem ?? produtos[produtoIndex].ordem
    }

    console.log(`[v0] Produto atualizado: ${id}`)

    return NextResponse.json(produtos[produtoIndex])
  } catch (error) {
    console.error('[v0] Erro ao atualizar produto:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar produto' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/produtos/:id - Remove produto
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const produtoIndex = produtos.findIndex(p => p.id === id)
  
  if (produtoIndex === -1) {
    return NextResponse.json(
      { error: 'Produto não encontrado' },
      { status: 404 }
    )
  }

  produtos.splice(produtoIndex, 1)

  console.log(`[v0] Produto removido: ${id}`)

  return NextResponse.json({ success: true })
}
