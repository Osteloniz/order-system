import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/categorias - Lista todas as categorias
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const categoriasOrdenadas = await prisma.categoria.findMany({
    orderBy: { ordem: 'asc' }
  })
  return NextResponse.json(categoriasOrdenadas)
}

// POST /api/admin/categorias - Cria nova categoria
export async function POST(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const ordem = await prisma.categoria.count() + 1
    const novaCategoria = await prisma.categoria.create({
      data: {
        nome: body.nome,
        ordem
      }
    })

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

