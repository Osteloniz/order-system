import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const imageUrlSchema = z.string().trim().max(500).refine((url) => {
  if (url.startsWith('/')) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}, 'URL de imagem invalida')

const produtoSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  descricao: z.string().trim().max(500).optional(),
  categoriaId: z.string().uuid(),
  preco: z.number().finite().min(1).max(1_000_000),
  ativo: z.boolean().optional(),
  imagemUrl: imageUrlSchema.optional(),
  imagens: z.array(imageUrlSchema).max(10).optional()
}).strict()

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
    const parsed = produtoSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data
    const imagens = body.imagens ?? []

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
