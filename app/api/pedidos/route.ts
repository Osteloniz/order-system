import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'
import { calcularTotalItem, calcularSubtotal, calcularTotal } from '@/lib/calc'
import type { CriarPedidoPayload } from '@/lib/types'

export const runtime = 'nodejs'

type ItemPedidoCreate = {
  produtoId: string
  nomeProdutoSnapshot: string
  precoUnitarioSnapshot: number
  quantidade: number
  totalItem: number
}

const pedidoSchema = z.object({
  clienteNome: z.string().trim().min(2).max(80),
  clienteTelefone: z.string().trim().min(8).max(20),
  clienteWhatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  pagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']),
  tipoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA']),
  enderecoEntrega: z.string().trim().max(200).optional(),
  distanciaKm: z.number().finite().nonnegative().max(100).optional(),
  cupomCodigo: z.string().trim().max(40).optional(),
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(99)
  })).min(1).max(50)
}).strict().superRefine((data, ctx) => {
  if (data.tipoEntrega !== 'RESERVA_PAULISTANO') return

  if (!data.clienteBloco?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteBloco'], message: 'Bloco obrigatorio' })
  }
  if (!data.clienteApartamento?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteApartamento'], message: 'Apartamento obrigatorio' })
  }
})

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

// POST /api/pedidos - Cria um novo pedido
export async function POST(request: NextRequest) {
  try {
    const parsed = pedidoSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body: CriarPedidoPayload = parsed.data
    const telefoneLimpo = normalizePhone(body.clienteTelefone)
    const whatsappLimpo = body.clienteWhatsapp ? normalizePhone(body.clienteWhatsapp) : ''
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 13) {
      return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
    }
    if (body.clienteWhatsapp && (whatsappLimpo.length < 10 || whatsappLimpo.length > 13)) {
      return NextResponse.json({ error: 'WhatsApp invalido' }, { status: 400 })
    }

    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }
    if (!tenant.isOpen) {
      return NextResponse.json({ error: 'Estabelecimento fechado' }, { status: 403 })
    }

    const itens: ItemPedidoCreate[] = []

    // Criar itens do pedido com snapshot
    for (const item of body.itens) {
      const produto = await prisma.produto.findFirst({
        where: { id: item.produtoId, ativo: true, tenantId: tenant.id }
      })
      if (!produto) {
        return NextResponse.json(
          { error: `Produto nao encontrado ou indisponivel: ${item.produtoId}` },
          { status: 400 }
        )
      }

      const totalItem = calcularTotalItem(produto.preco, item.quantidade)

      itens.push({
        produtoId: produto.id,
        nomeProdutoSnapshot: produto.nome,
        precoUnitarioSnapshot: produto.preco,
        quantidade: item.quantidade,
        totalItem
      })
    }

    const subtotal = calcularSubtotal(itens)
    const configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: tenant.id }
    })
    const frete = 0 // Sem taxa de entrega agora

    let cupomId: string | undefined
    let cupomCodigoSnapshot: string | undefined
    let descontoValor = 0

    if (body.cupomCodigo) {
      const codigo = body.cupomCodigo.trim().toUpperCase()
      const cupom = await prisma.cupom.findFirst({
        where: { codigo, tenantId: tenant.id }
      })

      const agora = new Date()
      if (!cupom || !cupom.ativo) {
        return NextResponse.json({ error: 'Cupom invalido' }, { status: 400 })
      }
      if (cupom.expiraEm <= agora) {
        return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 })
      }
      if (cupom.usos >= cupom.maxUsos) {
        return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 })
      }

      if (cupom.tipo === 'PERCENTUAL') {
        descontoValor = Math.round(subtotal * (cupom.valor / 100))
      } else {
        descontoValor = cupom.valor
      }
      descontoValor = Math.min(descontoValor, subtotal)
      cupomId = cupom.id
      cupomCodigoSnapshot = cupom.codigo
    }

    const total = calcularTotal(subtotal, frete) - descontoValor

    const novoPedido = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          status: 'FEITO',
          clienteNome: body.clienteNome.trim(),
          clienteTelefone: telefoneLimpo,
          clienteWhatsapp: whatsappLimpo || null,
          clienteBloco: body.clienteBloco?.trim() ?? null,
          clienteApartamento: body.clienteApartamento?.trim() ?? null,
          pagamento: body.pagamento,
          tipoEntrega: body.tipoEntrega,
          enderecoEntrega: null,
          enderecoRetirada: configuracao?.enderecoRetirada ?? '',
          frete,
          subtotal,
          total: Math.max(0, total),
          motivoCancelamento: null,
          statusPagamento: body.pagamento === 'PIX' || body.pagamento === 'CARTAO' ? 'PENDENTE' : 'NAO_APLICAVEL',
          distanciaKm: null,
          descontoValor: descontoValor > 0 ? descontoValor : null,
          cupomCodigoSnapshot: cupomCodigoSnapshot ?? null,
          cupomId: cupomId ?? null,
          tenantId: tenant.id,
          itens: {
            create: itens.map(item => ({
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

      if (cupomId) {
        await tx.cupom.update({
          where: { id: cupomId },
          data: { usos: { increment: 1 } }
        })
      }

      return pedido
    })

    console.log(`[v0] Novo pedido criado: ${novoPedido.id}`)

    return NextResponse.json(novoPedido, { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar pedido:', error)
    return NextResponse.json(
      { error: 'Erro interno ao processar pedido' },
      { status: 500 }
    )
  }
}

// Historico por telefone foi desativado para evitar exposicao de dados pessoais.
export async function GET(request: NextRequest) {
  return NextResponse.json({ error: 'Metodo nao permitido' }, { status: 405 })
}
