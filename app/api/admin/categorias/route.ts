import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// GET /api/admin/categorias - Lista todas as categorias
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const categoriasOrdenadas = await prisma.categoria.findMany({
    where: { tenantId: admin.tenantId },
    orderBy: { ordem: 'asc' }
  })
  return NextResponse.json(categoriasOrdenadas)
}

// POST /api/admin/categorias - Cria nova categoria
export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const ordem = await prisma.categoria.count({ where: { tenantId: admin.tenantId } }) + 1
    const novaCategoria = await prisma.categoria.create({
      data: {
        nome: body.nome,
        ordem,
        tenantId: admin.tenantId
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
