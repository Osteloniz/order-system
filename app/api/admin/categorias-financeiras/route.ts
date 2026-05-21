import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { appLogger } from '@/lib/app-logger'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const categoriaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  escopo: z.enum(['PAGAR', 'RECEBER', 'AMBOS']),
}).strict()

const querySchema = z.object({
  escopo: z.enum(['PAGAR', 'RECEBER', 'AMBOS', 'TODOS']).optional(),
}).strict()

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = querySchema.safeParse({
      escopo: request.nextUrl.searchParams.get('escopo') || 'TODOS',
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Filtro invalido' }, { status: 400 })
    }

    const { escopo } = parsed.data
    const categorias = await prisma.categoriaFinanceira.findMany({
      where: {
        tenantId: admin.tenantId,
        ...(escopo && escopo !== 'TODOS'
          ? {
              OR: [{ escopo }, { escopo: 'AMBOS' }],
            }
          : {}),
      },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })

    return NextResponse.json(categorias)
  } catch (error) {
    return handleApiError('api/admin/categorias-financeiras GET', error, 'Erro ao carregar categorias financeiras')
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = categoriaFinanceiraSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const ordem = await prisma.categoriaFinanceira.count({ where: { tenantId: admin.tenantId } }) + 1
    const categoria = await prisma.categoriaFinanceira.create({
      data: {
        tenantId: admin.tenantId,
        nome: parsed.data.nome,
        escopo: parsed.data.escopo,
        ordem,
      },
    })

    appLogger.info(`[api/admin/categorias-financeiras] Categoria financeira criada: ${categoria.id}`)

    return NextResponse.json(categoria, { status: 201 })
  } catch (error) {
    return handleApiError('api/admin/categorias-financeiras POST', error, 'Erro ao criar categoria financeira')
  }
}
