import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// PUT /api/admin/produtos/:id - Atualiza produto
export async function PUT(
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

    if (body.categoriaId) {
      const categoria = await prisma.categoria.findFirst({ where: { id: body.categoriaId, tenantId: admin.tenantId } })
      if (!categoria) {
        return NextResponse.json(
          { error: 'Categoria nao encontrada' },
          { status: 400 }
        )
      }
    }

    const imagens = Array.isArray(body.imagens)
      ? body.imagens.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
      : produto.imagens

    const produtoAtualizado = await prisma.produto.update({
      where: { id },
      data: {
        nome: body.nome ?? produto.nome,
        descricao: body.descricao ?? produto.descricao,
        categoriaId: body.categoriaId ?? produto.categoriaId,
        preco: body.preco !== undefined ? Math.round(body.preco) : produto.preco,
        imagemUrl: body.imagemUrl ?? produto.imagemUrl,
        imagens,
        ativo: body.ativo ?? produto.ativo,
        ordem: body.ordem ?? produto.ordem
      }
    })

    console.log(`[v0] Produto atualizado: ${id}`)

    return NextResponse.json(produtoAtualizado)
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
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const produto = await prisma.produto.findFirst({ where: { id, tenantId: admin.tenantId } })
  if (!produto) {
    return NextResponse.json(
      { error: 'Produto nao encontrado' },
      { status: 404 }
    )
  }

  const usadoEmPedidos = await prisma.itemPedido.count({ where: { produtoId: id } })
  if (usadoEmPedidos > 0) {
    return NextResponse.json(
      { error: 'Produto possui itens de pedido e nao pode ser removido' },
      { status: 400 }
    )
  }

  await prisma.produto.delete({ where: { id } })

  console.log(`[v0] Produto removido: ${id}`)

  return NextResponse.json({ success: true })
}
