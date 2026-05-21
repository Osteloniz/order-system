import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const contaPagarSchema = z.object({
  descricao: z.string().trim().min(2).max(120),
  categoria: z.string().trim().max(60).optional(),
  fornecedor: z.string().trim().max(80).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  valor: z.number().int().positive(),
  vencimento: z.string().datetime(),
  status: z.enum(['PENDENTE', 'PAGO', 'CANCELADO']),
  pagoEm: z.string().datetime().optional(),
}).strict()

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

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

  const updated = await prisma.contaPagar.update({
    where: { id: conta.id },
    data: {
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

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await context.params
  const conta = await prisma.contaPagar.findFirst({
    where: { id, tenantId: admin.tenantId },
  })
  if (!conta) return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })

  await prisma.contaPagar.delete({ where: { id: conta.id } })
  return NextResponse.json({ ok: true })
}
