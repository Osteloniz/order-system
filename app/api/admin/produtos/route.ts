import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/produtos - Lista todos os produtos
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const produtos = await prisma.produto.findMany({
    include: { categoria: true }
  })

  const produtosComCategoria = produtos.map(p => ({
    ...p,
    categoriaNome: p.categoria?.nome || 'Sem categoria'
  }))

  return NextResponse.json(produtosComCategoria)
}

// POST /api/admin/produtos - Cria novo produto
export async function POST(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const imagens = Array.isArray(body.imagens)
      ? body.imagens.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
      : []

    const categoria = await prisma.categoria.findUnique({ where: { id: body.categoriaId } })
    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoria nao encontrada' },
        { status: 400 }
      )
    }

    const ordem = await prisma.produto.count({ where: { categoriaId: body.categoriaId } }) + 1

    const novoProduto = await prisma.produto.create({
      data: {
        nome: body.nome,
        descricao: body.descricao || '',
        categoriaId: body.categoriaId,
        preco: Math.round(body.preco),
        ativo: body.ativo ?? true,
        imagemUrl: body.imagemUrl,
        imagens,
        ordem
      }
    })

    console.log(`[v0] Produto criado: ${novoProduto.id}`)

    return NextResponse.json(novoProduto, { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar produto:', error)
    return NextResponse.json(
      { error: 'Erro ao criar produto' },
      { status: 500 }
    )
  }
}
