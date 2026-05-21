import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { todayInSaoPaulo } from '@/lib/sao-paulo'

export const runtime = 'nodejs'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['TODOS', 'PENDENTE', 'PAGO', 'CANCELADO']).optional(),
}).strict()

const contaPagarSchema = z.object({
  descricao: z.string().trim().min(2).max(120),
  categoria: z.string().trim().max(60).optional(),
  fornecedor: z.string().trim().max(80).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  valor: z.number().int().positive(),
  vencimento: z.string().datetime(),
  status: z.enum(['PENDENTE', 'PAGO', 'CANCELADO']).optional(),
  pagoEm: z.string().datetime().optional(),
}).strict()

function getPeriodRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${to}T24:00:00-03:00`),
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const today = todayInSaoPaulo()
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get('from') || today,
      to: request.nextUrl.searchParams.get('to') || today,
      status: request.nextUrl.searchParams.get('status') || 'TODOS',
    })
    if (!parsed.success) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })

    const { from, to, status } = parsed.data
    const { start, end } = getPeriodRange(from, to)

    const contas = await prisma.contaPagar.findMany({
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
      contas,
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

    const conta = await prisma.contaPagar.create({
      data: {
        tenantId: admin.tenantId,
        descricao: body.descricao.trim(),
        categoria: body.categoria?.trim() || null,
        fornecedor: body.fornecedor?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
        valor: body.valor,
        vencimento: new Date(body.vencimento),
        status,
        pagoEm,
      },
    })

    return NextResponse.json(conta, { status: 201 })
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-pagar POST', error, 'Erro ao criar conta a pagar')
  }
}
