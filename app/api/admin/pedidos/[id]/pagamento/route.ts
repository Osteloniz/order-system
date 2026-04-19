import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const pagamentoSchema = z.object({
  statusPagamento: z.enum(['NAO_APLICAVEL', 'PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'REEMBOLSADO']),
}).strict()

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const parsed = pagamentoSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  const { id } = await params
  const pedido = await prisma.pedido.findFirst({
    where: { id, tenantId: admin.tenantId },
    select: { id: true, status: true },
  })

  if (!pedido) {
    return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
  }

  if (pedido.status === 'CANCELADO') {
    return NextResponse.json(
      { error: 'Pedido cancelado nao pode ter pagamento alterado' },
      { status: 400 }
    )
  }

  const atualizado = await prisma.pedido.update({
    where: { id },
    data: { statusPagamento: parsed.data.statusPagamento },
    include: { itens: true },
  })

  return NextResponse.json(atualizado)
}
