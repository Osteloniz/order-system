import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { hasFornecedorFinanceiroSchema, resolveFornecedorFinanceiro } from '@/lib/fornecedores-financeiros'
import { getCurrentMonthRangeInSaoPaulo } from '@/lib/sao-paulo'

export const runtime = 'nodejs'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['TODOS', 'PENDENTE', 'PAGO', 'CANCELADO']).optional(),
}).strict()

const isoDateTimeSchema = z.string().datetime({ offset: true })

const contaPagarSchema = z.object({
  descricao: z.string().trim().min(2).max(120),
  categoria: z.string().trim().max(60).optional(),
  categoriaFinanceiraId: z.string().uuid().optional(),
  fornecedorFinanceiroId: z.string().trim().min(1).max(120).optional(),
  fornecedor: z.string().trim().max(80).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  valor: z.number().int().positive(),
  vencimento: isoDateTimeSchema,
  status: z.enum(['PENDENTE', 'PAGO', 'CANCELADO']).optional(),
  pagoEm: isoDateTimeSchema.optional(),
}).strict()

function getPeriodRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${to}T24:00:00-03:00`),
  }
}

function mapContaPagarResponse<T extends { fornecedor?: string | null; fornecedorFinanceiroId?: string | null }>(
  conta: T & { fornecedorFinanceiro?: { nome: string } | null }
) {
  return {
    ...conta,
    fornecedorFinanceiroId: conta.fornecedorFinanceiroId ?? null,
    fornecedorFinanceiroNome: conta.fornecedorFinanceiro?.nome ?? conta.fornecedor ?? null,
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const defaultRange = getCurrentMonthRangeInSaoPaulo()
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get('from') || defaultRange.from,
      to: request.nextUrl.searchParams.get('to') || defaultRange.to,
      status: request.nextUrl.searchParams.get('status') || 'TODOS',
    })
    if (!parsed.success) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })

    const { from, to, status } = parsed.data
    const { start, end } = getPeriodRange(from, to)
    const hasStructuredSchema = await hasFornecedorFinanceiroSchema()

    const contas = hasStructuredSchema
      ? await prisma.contaPagar.findMany({
          where: {
            tenantId: admin.tenantId,
            vencimento: { gte: start, lt: end },
            ...(status && status !== 'TODOS' ? { status } : {}),
          },
          include: {
            fornecedorFinanceiro: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
          orderBy: [{ vencimento: 'asc' }, { criadoEm: 'desc' }],
        })
      : await prisma.contaPagar.findMany({
          where: {
            tenantId: admin.tenantId,
            vencimento: { gte: start, lt: end },
            ...(status && status !== 'TODOS' ? { status } : {}),
          },
          orderBy: [{ vencimento: 'asc' }, { criadoEm: 'desc' }],
        })

    const resumo = contas.reduce(
      (acc, conta) => {
        acc.total += conta.valor
        if (conta.status === 'PENDENTE') acc.pendente += conta.valor
        if (conta.status === 'PAGO') acc.pago += conta.valor
        if (conta.status === 'CANCELADO') acc.cancelado += conta.valor
        return acc
      },
      { total: 0, pendente: 0, pago: 0, cancelado: 0 }
    )

    return NextResponse.json({
      from,
      to,
      status,
      totalRegistros: contas.length,
      resumo,
      contas: contas.map((conta) => mapContaPagarResponse(conta)),
    })
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-pagar GET', error, 'Erro ao carregar contas a pagar')
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const parsed = contaPagarSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data
    const status = body.status ?? 'PENDENTE'
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

    const fornecedorResolvido = await resolveFornecedorFinanceiro({
      tenantId: admin.tenantId,
      fornecedorFinanceiroId: body.fornecedorFinanceiroId ?? null,
      fornecedor: body.fornecedor ?? null,
    })

    if ('error' in fornecedorResolvido) {
      return NextResponse.json({ error: fornecedorResolvido.error }, { status: 400 })
    }

    const conta = fornecedorResolvido.hasStructuredSchema
      ? await prisma.contaPagar.create({
          data: {
            tenantId: admin.tenantId,
            descricao: body.descricao.trim(),
            categoria: categoriaFinanceiraNome,
            categoriaFinanceiraId: body.categoriaFinanceiraId || null,
            fornecedorFinanceiroId: fornecedorResolvido.fornecedorFinanceiroId,
            fornecedor: fornecedorResolvido.fornecedor,
            observacoes: body.observacoes?.trim() || null,
            valor: body.valor,
            vencimento: new Date(body.vencimento),
            status,
            pagoEm,
          },
          include: {
            fornecedorFinanceiro: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        })
      : await prisma.contaPagar.create({
          data: {
            tenantId: admin.tenantId,
            descricao: body.descricao.trim(),
            categoria: categoriaFinanceiraNome,
            categoriaFinanceiraId: body.categoriaFinanceiraId || null,
            fornecedor: fornecedorResolvido.fornecedor,
            observacoes: body.observacoes?.trim() || null,
            valor: body.valor,
            vencimento: new Date(body.vencimento),
            status,
            pagoEm,
          },
        })

    return NextResponse.json(mapContaPagarResponse(conta), { status: 201 })
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-pagar POST', error, 'Erro ao criar conta a pagar')
  }
}
