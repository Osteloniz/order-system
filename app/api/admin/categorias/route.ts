import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { categorias, gerarId } from '@/lib/mock-db'
import type { Categoria } from '@/lib/types'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/categorias - Lista todas as categorias
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const categoriasOrdenadas = [...categorias].sort((a, b) => a.ordem - b.ordem)
  return NextResponse.json(categoriasOrdenadas)
}

// POST /api/admin/categorias - Cria nova categoria
export async function POST(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    
    const novaCategoria: Categoria = {
      id: gerarId('cat'),
      nome: body.nome,
      ordem: categorias.length + 1
    }

    categorias.push(novaCategoria)

    console.log(`[v0] Categoria criada: ${novaCategoria.id}`)

    return NextResponse.json(novaCategoria, { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar categoria:', error)
    return NextResponse.json(
      { error: 'Erro ao criar categoria' },
      { status: 500 }
    )
  }
}
