import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { buildClienteFidelidade, buildClienteResumoConsumo } from '@/lib/clientes-summary'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { isValidPhone, normalizePhone } from '@/lib/phone'

export const runtime = 'nodejs'

const clienteSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  observacoes: z.string().trim().max(1000).optional(),
}).strict()

function serializeClienteDetalhe(cliente: {
  id: string
  tenantId: string
  nome: string
  telefone: string | null
  whatsapp: string | null
  clienteBloco: string | null
  clienteApartamento: string | null
  observacoes: string | null
  mimosEntregues: number
  criadoEm: Date
  atualizadoEm: Date
  pedidos: {
    id: string
    criadoEm: Date
    itens: {
      nomeProdutoSnapshot: string
      quantidade: number
    }[]
  }[]
}) {
  if (!cliente) return cliente

  const resumoConsumo = buildClienteResumoConsumo(cliente.pedidos ?? [])

  return {
    ...cliente,
    totalPedidos: cliente.pedidos?.length ?? 0,
    ultimoPedidoEm: cliente.pedidos?.[0]?.criadoEm ?? null,
    resumoConsumo,
    resumoFidelidade: buildClienteFidelidade(resumoConsumo.totalCookies, cliente.mimosEntregues ?? 0),
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const { id } = await params
    const cliente = await prisma.cliente.findFirst({
      where: { id, tenantId: admin.tenantId },
      include: {
        pedidos: {
          include: { itens: true },
          orderBy: { criadoEm: 'desc' },
        },
      },
    })

    if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })

    return NextResponse.json(serializeClienteDetalhe(cliente))
  } catch (error) {
    return handleApiError('api/admin/clientes/[id] GET', error, 'Erro ao carregar cliente')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const { id } = await params
    const parsed = clienteSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })

    const current = await prisma.cliente.findFirst({ where: { id, tenantId: admin.tenantId } })
    if (!current) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })

    const body = parsed.data
    const whatsapp = body.whatsapp ? normalizePhone(body.whatsapp) : current.telefone
    if (whatsapp && !isValidPhone(whatsapp)) {
      return NextResponse.json({ error: 'WhatsApp invalido' }, { status: 400 })
    }

    const cliente = await prisma.cliente.update({
      where: { id },
      data: {
        nome: body.nome.trim(),
        whatsapp,
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

    return NextResponse.json(serializeClienteDetalhe(cliente))
  } catch (error) {
    return handleApiError('api/admin/clientes/[id] PATCH', error, 'Erro ao atualizar cliente')
  }
}
