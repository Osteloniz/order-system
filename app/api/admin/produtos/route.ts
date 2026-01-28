import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// GET /api/admin/produtos - Lista todos os produtos
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const produtos = await prisma.produto.findMany({
    where: { tenantId: admin.tenantId },
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
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const imagens = Array.isArray(body.imagens)
      ? body.imagens.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
      : []

    const categoria = await prisma.categoria.findFirst({ where: { id: body.categoriaId, tenantId: admin.tenantId } })
    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoria nao encontrada' },
        { status: 400 }
      )
    }

    const ordem = await prisma.produto.count({ where: { categoriaId: body.categoriaId, tenantId: admin.tenantId } }) + 1

    const novoProduto = await prisma.produto.create({
      data: {
        nome: body.nome,
        descricao: body.descricao || '',
        categoriaId: body.categoriaId,
        preco: Math.round(body.preco),
        ativo: body.ativo ?? true,
        imagemUrl: body.imagemUrl,
        imagens,
        ordem,
        tenantId: admin.tenantId
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
