import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const isoDateTimeSchema = z.string().datetime({ offset: true })

const contaPagarSchema = z.object({
  descricao: z.string().trim().min(2).max(120),
  categoria: z.string().trim().max(60).optional(),
  categoriaFinanceiraId: z.string().uuid().optional(),
  fornecedor: z.string().trim().max(80).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  valor: z.number().int().positive(),
  vencimento: isoDateTimeSchema,
  status: z.enum(['PENDENTE', 'PAGO', 'CANCELADO']),
  pagoEm: isoDateTimeSchema.optional(),
}).strict()

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const { id } = await context.params
    const parsed = contaPagarSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data
    const conta = await prisma.contaPagar.findFirst({
      where: { id, tenantId: admin.tenantId },
    })
    if (!conta) return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })

    const status = body.status
    const pagoEm = status === 'PAGO' ? new Date(body.pagoEm ?? body.vencimento) : null
    let categoriaFinanceiraNome: string | null = body.categoria?.trim() || null

    if (body.categoriaFinanceiraId) {
      const categoriaFinanceira = await prisma.categoriaFinanceira.findFirst({
        where: {
          id: body.categoriaFinanceiraId,
          tenantId: admin.tenantId,
          OR: [{ escopo: 'PAGAR' }, { escopo: 'AMBOS' }],
        },
      })

      if (!categoriaFinanceira) {
        return NextResponse.json({ error: 'Categoria financeira invalida' }, { status: 400 })
      }

      categoriaFinanceiraNome = categoriaFinanceira.nome
    }

    const updated = await prisma.contaPagar.update({
      where: { id: conta.id },
      data: {
        descricao: body.descricao.trim(),
        categoria: categoriaFinanceiraNome,
        categoriaFinanceiraId: body.categoriaFinanceiraId || null,
        fornecedor: body.fornecedor?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
        valor: body.valor,
        vencimento: new Date(body.vencimento),
        status,
        pagoEm,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-pagar/[id] PATCH', error, 'Erro ao atualizar conta a pagar')
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const { id } = await context.params
    const conta = await prisma.contaPagar.findFirst({
      where: { id, tenantId: admin.tenantId },
    })
    if (!conta) return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })

    await prisma.contaPagar.delete({ where: { id: conta.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-pagar/[id] DELETE', error, 'Erro ao excluir conta a pagar')
  }
}
