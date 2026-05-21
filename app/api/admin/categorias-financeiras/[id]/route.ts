import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { appLogger } from '@/lib/app-logger'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const categoriaFinanceiraUpdateSchema = z.object({
  nome: z.string().trim().min(2).max(80).optional(),
  escopo: z.enum(['PAGAR', 'RECEBER', 'AMBOS']).optional(),
  ordem: z.number().int().min(0).max(10_000).optional(),
}).strict()

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const parsed = categoriaFinanceiraUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const categoria = await prisma.categoriaFinanceira.findFirst({
      where: { id, tenantId: admin.tenantId },
    })
    if (!categoria) {
      return NextResponse.json({ error: 'Categoria financeira nao encontrada' }, { status: 404 })
    }

    const atualizada = await prisma.categoriaFinanceira.update({
      where: { id },
      data: {
        nome: parsed.data.nome ?? categoria.nome,
        escopo: parsed.data.escopo ?? categoria.escopo,
        ordem: parsed.data.ordem ?? categoria.ordem,
      },
    })

    appLogger.info(`[api/admin/categorias-financeiras/[id]] Categoria financeira atualizada: ${id}`)

    return NextResponse.json(atualizada)
  } catch (error) {
    return handleApiError('api/admin/categorias-financeiras/[id] PUT', error, 'Erro ao atualizar categoria financeira')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const categoria = await prisma.categoriaFinanceira.findFirst({
      where: { id, tenantId: admin.tenantId },
    })
    if (!categoria) {
      return NextResponse.json({ error: 'Categoria financeira nao encontrada' }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.contaPagar.updateMany({
        where: { tenantId: admin.tenantId, categoriaFinanceiraId: id },
        data: { categoriaFinanceiraId: null },
      }),
      prisma.categoriaFinanceira.delete({
        where: { id },
      }),
    ])

    appLogger.info(`[api/admin/categorias-financeiras/[id]] Categoria financeira removida: ${id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError('api/admin/categorias-financeiras/[id] DELETE', error, 'Erro ao remover categoria financeira')
  }
}
