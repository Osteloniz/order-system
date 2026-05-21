import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const categoriaUpdateSchema = z.object({
  nome: z.string().trim().min(2).max(80).optional(),
  ordem: z.number().int().min(0).max(10_000).optional()
}).strict()

// PUT /api/admin/categorias/:id - Atualiza categoria
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const parsed = categoriaUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data

    const categoria = await prisma.categoria.findFirst({ where: { id, tenantId: admin.tenantId } })
    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoria nao encontrada' },
        { status: 404 }
      )
    }

    const categoriaAtualizada = await prisma.categoria.update({
      where: { id },
      data: {
        nome: body.nome ?? categoria.nome,
        ordem: body.ordem ?? categoria.ordem
      }
    })

    appLogger.info(`[api/admin/categorias/[id]] Categoria atualizada: ${id}`)

    return NextResponse.json(categoriaAtualizada)
  } catch (error) {
    console.error('[v0] Erro ao atualizar categoria:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar categoria' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/categorias/:id - Remove categoria
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const produtosCount = await prisma.produto.count({ where: { categoriaId: id, tenantId: admin.tenantId } })
  if (produtosCount > 0) {
    return NextResponse.json(
      { error: 'Categoria possui produtos e nao pode ser removida' },
      { status: 400 }
    )
  }

  const categoria = await prisma.categoria.findFirst({ where: { id, tenantId: admin.tenantId } })
  if (!categoria) {
    return NextResponse.json(
      { error: 'Categoria nao encontrada' },
      { status: 404 }
    )
  }

  await prisma.categoria.delete({ where: { id } })

  appLogger.info(`[api/admin/categorias/[id]] Categoria removida: ${id}`)

  return NextResponse.json({ success: true })
}
