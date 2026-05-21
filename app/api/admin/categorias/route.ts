import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const categoriaSchema = z.object({
  nome: z.string().trim().min(2).max(80)
}).strict()

// GET /api/admin/categorias - Lista todas as categorias
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const categoriasOrdenadas = await prisma.categoria.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: { ordem: 'asc' }
    })
    return NextResponse.json(categoriasOrdenadas)
  } catch (error) {
    return handleApiError(
      'api/admin/categorias GET',
      error,
      'Erro ao carregar categorias. Confira a conexao com o banco e tente novamente.'
    )
  }
}

// POST /api/admin/categorias - Cria nova categoria
export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = categoriaSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const ordem = await prisma.categoria.count({ where: { tenantId: admin.tenantId } }) + 1
    const novaCategoria = await prisma.categoria.create({
      data: {
        nome: parsed.data.nome,
        ordem,
        tenantId: admin.tenantId
      }
    })

    appLogger.info(`[api/admin/categorias] Categoria criada: ${novaCategoria.id}`)

    return NextResponse.json(novaCategoria, { status: 201 })
  } catch (error) {
    return handleApiError('api/admin/categorias POST', error, 'Erro ao criar categoria')
  }
}
