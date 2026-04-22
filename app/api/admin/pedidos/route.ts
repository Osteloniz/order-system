import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'
import { getAdminSession } from '@/lib/auth-helpers'
import { calcularPedidoAdmin, normalizePhone } from '@/lib/admin-pedidos'

export const runtime = 'nodejs'

const pedidoAdminSchema = z.object({
  clienteId: z.string().uuid().optional(),
  clienteNome: z.string().trim().min(2).max(80),
  clienteTelefone: z.string().trim().max(20).optional(),
  clienteWhatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  clienteObservacoes: z.string().trim().max(1000).optional(),
  pagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']),
  tipoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA', 'ENCOMENDA']),
  encomendaPara: z.string().trim().optional(),
  statusPagamento: z.enum(['NAO_APLICAVEL', 'PENDENTE', 'APROVADO']).optional(),
  cupomCodigo: z.string().trim().max(40).optional(),
  valorPromocional: z.number().int().min(0).max(1_000_000).optional(),
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(99)
  })).min(1).max(50)
}).strict().superRefine((data, ctx) => {
  if (data.tipoEntrega === 'RESERVA_PAULISTANO') {
    if (!data.clienteBloco?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteBloco'], message: 'Bloco obrigatorio' })
    }
    if (!data.clienteApartamento?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteApartamento'], message: 'Apartamento obrigatorio' })
    }
  }

  if (data.tipoEntrega === 'ENCOMENDA') {
    const parsedDate = data.encomendaPara ? new Date(data.encomendaPara) : null
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['encomendaPara'], message: 'Data e hora da encomenda obrigatorias' })
    }
  }
  if (data.cupomCodigo?.trim() && (data.valorPromocional ?? 0) > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valorPromocional'], message: 'Use cupom ou valor promocional' })
  }
})

function getDayRange(dateParam: string) {
  const start = new Date(`${dateParam}T00:00:00-03:00`)
  const end = new Date(`${dateParam}T24:00:00-03:00`)
  return { start, end }
}

// Middleware de autenticacao
// GET /api/admin/pedidos?status=... - Lista pedidos
export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') as StatusPedido | null
  const date = searchParams.get('date')
  const carryoverNovos = searchParams.get('carryoverNovos') === '1'

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Data invalida' }, { status: 400 })
  }

  const where = status ? { status, tenantId: admin.tenantId } : { tenantId: admin.tenantId }
  if (date) {
    const { start, end } = getDayRange(date)
    Object.assign(where, {
      OR: [
        {
          tipoEntrega: { not: 'ENCOMENDA' },
          criadoEm: { gte: start, lt: end },
        },
        {
          tipoEntrega: 'ENCOMENDA',
          encomendaPara: { gte: start, lt: end },
        },
        ...(carryoverNovos ? [{
          status: 'FEITO',
          criadoEm: { lt: start },
        }] : []),
      ],
    })
  }

  const resultado = await prisma.pedido.findMany({
    where,
    include: { itens: true },
    orderBy: { criadoEm: 'desc' }
  })

  return NextResponse.json(resultado)
}

// POST /api/admin/pedidos - Cria pedido manual pelo painel admin.
export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = pedidoAdminSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data
    const telefoneLimpo = normalizePhone(body.clienteTelefone)
    const whatsappLimpo = normalizePhone(body.clienteWhatsapp)

    if (telefoneLimpo && (telefoneLimpo.length < 10 || telefoneLimpo.length > 13)) {
      return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
    }
    if (whatsappLimpo && (whatsappLimpo.length < 10 || whatsappLimpo.length > 13)) {
      return NextResponse.json({ error: 'WhatsApp invalido' }, { status: 400 })
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const configuracao = await tx.configuracao.findFirst({
        where: { tenantId: admin.tenantId }
      })
      const calculado = await calcularPedidoAdmin(tx, admin.tenantId, body)

      const novoPedido = await tx.pedido.create({
        data: {
          clienteId: calculado.clienteId,
          status: 'FEITO',
          clienteNome: calculado.clienteNome,
          clienteTelefone: calculado.clienteTelefone,
          clienteWhatsapp: calculado.clienteWhatsapp,
          clienteBloco: calculado.clienteBloco,
          clienteApartamento: calculado.clienteApartamento,
          pagamento: calculado.pagamento,
          tipoEntrega: calculado.tipoEntrega,
          encomendaPara: calculado.encomendaPara,
          enderecoEntrega: null,
          enderecoRetirada: configuracao?.enderecoRetirada ?? '',
          frete: calculado.frete,
          subtotal: calculado.subtotal,
          total: calculado.total,
          motivoCancelamento: null,
          statusPagamento: calculado.statusPagamento,
          distanciaKm: null,
          descontoValor: calculado.descontoValor > 0 ? calculado.descontoValor : null,
          cupomCodigoSnapshot: calculado.cupomCodigoSnapshot,
          cupomId: calculado.cupomId,
          tenantId: admin.tenantId,
          itens: {
            create: calculado.itens.map(item => ({
              produtoId: item.produtoId,
              nomeProdutoSnapshot: item.nomeProdutoSnapshot,
              precoUnitarioSnapshot: item.precoUnitarioSnapshot,
              quantidade: item.quantidade,
              totalItem: item.totalItem
            }))
          }
        },
        include: { itens: true }
      })

      if (calculado.cupomId) {
        await tx.cupom.update({
          where: { id: calculado.cupomId },
          data: { usos: { increment: 1 } }
        })
      }

      return novoPedido
    })

    return NextResponse.json(pedido, { status: 201 })
  } catch (error) {
    console.error('[api/admin/pedidos] Erro ao criar pedido manual:', error)
    return NextResponse.json({ error: 'Erro ao criar pedido manual' }, { status: 500 })
  }
}
