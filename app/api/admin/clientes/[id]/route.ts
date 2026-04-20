import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const clienteSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  observacoes: z.string().trim().max(1000).optional(),
}).strict()

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = clienteSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })

  const current = await prisma.cliente.findFirst({ where: { id, tenantId: admin.tenantId } })
  if (!current) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })

  const body = parsed.data
  const cliente = await prisma.cliente.update({
    where: { id },
    data: {
      nome: body.nome.trim(),
      whatsapp: body.whatsapp ? normalizePhone(body.whatsapp) : current.telefone,
      clienteBloco: body.clienteBloco?.trim() || null,
      clienteApartamento: body.clienteApartamento?.trim() || null,
      observacoes: body.observacoes?.trim() || null,
    },
    include: {
      pedidos: {
        include: { itens: true },
        orderBy: { criadoEm: 'desc' },
        take: 20,
      },
    },
  })

  return NextResponse.json(cliente)
}
