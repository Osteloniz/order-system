import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { produtos, categorias, gerarId } from '@/lib/mock-db'
import type { Produto } from '@/lib/types'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/produtos - Lista todos os produtos
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const produtosComCategoria = produtos.map(p => ({
    ...p,
    categoriaNome: categorias.find(c => c.id === p.categoriaId)?.nome || 'Sem categoria'
  }))

  return NextResponse.json(produtosComCategoria)
}

// POST /api/admin/produtos - Cria novo produto
export async function POST(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const imagens = Array.isArray(body.imagens)
      ? body.imagens.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
      : undefined
    
    const novoProduto: Produto = {
      id: gerarId('prod'),
      nome: body.nome,
      descricao: body.descricao || '',
      categoriaId: body.categoriaId,
      preco: Math.round(body.preco), // Garantir inteiro (centavos)
      ativo: body.ativo ?? true,
      imagemUrl: body.imagemUrl,
      imagens,
      ordem: produtos.filter(p => p.categoriaId === body.categoriaId).length + 1
    }

    produtos.push(novoProduto)

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
