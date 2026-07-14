import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'
import { generatePublicOrderAccessToken, hashPublicOrderAccessToken } from '@/lib/public-order-access'
import { calcularTotalItem, calcularSubtotal, calcularTotal } from '@/lib/calc'
import { getPhoneLookupCandidates, isValidPhone, normalizePhone } from '@/lib/phone'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
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
  tipoCartao: z.enum(['CREDITO', 'DEBITO']).optional(),
  tipoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA', 'ENCOMENDA']),
  encomendaPara: z.string().trim().optional(),
  enderecoEntrega: z.string().trim().max(200).optional(),
  distanciaKm: z.number().finite().nonnegative().max(100).optional(),
  cupomCodigo: z.string().trim().max(40).optional(),
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
})

function serializePublicPedido(
  pedido: {
    id: string
    clienteId: string | null
    status: 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'ENTREGUE' | 'CANCELADO'
    statusPagamento: 'NAO_APLICAVEL' | 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REEMBOLSADO'
    clienteNome: string
    clienteTelefone: string | null
    clienteWhatsapp: string | null
    clienteBloco: string | null
    clienteApartamento: string | null
    observacoesPedido: string | null
    pagamento: 'PIX' | 'DINHEIRO' | 'CARTAO'
    tipoCartao: 'CREDITO' | 'DEBITO' | null
    tipoEntrega: 'ENTREGA' | 'RESERVA_PAULISTANO' | 'RETIRADA' | 'ENCOMENDA'
    encomendaPara: Date | null
    enderecoRetirada: string
    frete: number
    subtotal: number
    total: number
    criadoEm: Date
    motivoCancelamento: string | null
    distanciaKm: number | null
    descontoValor: number | null
    cupomCodigoSnapshot: string | null
    itens: Array<{
      id: string
      pedidoId: string
      produtoId: string
      nomeProdutoSnapshot: string
      precoUnitarioSnapshot: number
      quantidade: number
      totalItem: number
      quantidadePreparada: number
      preparadoEm: Date | null
    }>
  },
  publicAccessToken?: string | null
) {
  return {
    id: pedido.id,
    clienteId: pedido.clienteId,
    status: pedido.status,
    statusPagamento: pedido.statusPagamento,
    clienteNome: pedido.clienteNome,
    clienteTelefone: pedido.clienteTelefone,
    clienteWhatsapp: pedido.clienteWhatsapp,
    clienteBloco: pedido.clienteBloco,
    clienteApartamento: pedido.clienteApartamento,
    observacoesPedido: pedido.observacoesPedido,
    pagamento: pedido.pagamento,
    tipoCartao: pedido.tipoCartao,
    tipoEntrega: pedido.tipoEntrega,
    encomendaPara: pedido.encomendaPara,
    enderecoRetirada: pedido.enderecoRetirada,
    frete: pedido.frete,
    subtotal: pedido.subtotal,
    total: pedido.total,
    criadoEm: pedido.criadoEm,
    motivoCancelamento: pedido.motivoCancelamento,
    distanciaKm: pedido.distanciaKm,
    descontoValor: pedido.descontoValor,
    cupomCodigoSnapshot: pedido.cupomCodigoSnapshot,
    itens: pedido.itens,
    publicAccessToken: publicAccessToken ?? null,
  }
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
    const telefoneCandidates = getPhoneLookupCandidates(body.clienteTelefone)
    const whatsappCandidates = getPhoneLookupCandidates(body.clienteWhatsapp)
    if (!isValidPhone(telefoneLimpo)) {
      return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
    }
    if (body.clienteWhatsapp && !isValidPhone(whatsappLimpo)) {
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
    const entregaReservaDisponivel = configuracao?.checkoutPublicoEntregaReservaPaulistano ?? true
    const entregaRetiradaDisponivel = configuracao?.checkoutPublicoEntregaRetirada ?? true
    const entregaEncomendaDisponivel = configuracao?.checkoutPublicoEntregaEncomenda ?? true
    const pagamentoPixDisponivel = configuracao?.checkoutPublicoPagamentoPix ?? true
    const pagamentoDinheiroDisponivel = configuracao?.checkoutPublicoPagamentoDinheiro ?? true
    const pagamentoCartaoDisponivel = configuracao?.checkoutPublicoPagamentoCartao ?? true
    const cartaoCreditoDisponivel = configuracao?.checkoutPublicoPagamentoCartaoCredito ?? true
    const cartaoDebitoDisponivel = configuracao?.checkoutPublicoPagamentoCartaoDebito ?? true

    if (
      (body.tipoEntrega === 'RESERVA_PAULISTANO' && !entregaReservaDisponivel) ||
      (body.tipoEntrega === 'RETIRADA' && !entregaRetiradaDisponivel) ||
      (body.tipoEntrega === 'ENCOMENDA' && !entregaEncomendaDisponivel)
    ) {
      return NextResponse.json({ error: 'Esse tipo de entrega nao esta disponivel no momento' }, { status: 400 })
    }

    if (
      (body.pagamento === 'PIX' && !pagamentoPixDisponivel) ||
      (body.pagamento === 'DINHEIRO' && !pagamentoDinheiroDisponivel) ||
      (body.pagamento === 'CARTAO' && !pagamentoCartaoDisponivel)
    ) {
      return NextResponse.json({ error: 'Essa forma de pagamento nao esta disponivel no momento' }, { status: 400 })
    }

    let encomendaParaPedido: Date | null = null
    if (body.tipoEntrega === 'ENCOMENDA') {
      if ((configuracao?.checkoutPublicoEncomendaModo ?? 'CLIENTE_DEFINE') === 'FIXO') {
        if (!configuracao?.checkoutPublicoEncomendaDataFixa) {
          return NextResponse.json({ error: 'A loja ainda nao configurou a data fixa para encomenda' }, { status: 400 })
        }
        encomendaParaPedido = configuracao.checkoutPublicoEncomendaDataFixa
      } else {
        const parsedDate = body.encomendaPara ? new Date(body.encomendaPara) : null
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json({ error: 'Data e hora da encomenda obrigatorias' }, { status: 400 })
        }
        encomendaParaPedido = parsedDate
      }
    }

    let tipoCartaoPedido: 'CREDITO' | 'DEBITO' | null = null
    if (body.pagamento === 'CARTAO') {
      if (body.tipoCartao === 'CREDITO' && !cartaoCreditoDisponivel) {
        return NextResponse.json({ error: 'Cartao de credito indisponivel no momento' }, { status: 400 })
      }
      if (body.tipoCartao === 'DEBITO' && !cartaoDebitoDisponivel) {
        return NextResponse.json({ error: 'Cartao de debito indisponivel no momento' }, { status: 400 })
      }

      if (body.tipoCartao) {
        tipoCartaoPedido = body.tipoCartao
      } else if (cartaoCreditoDisponivel && !cartaoDebitoDisponivel) {
        tipoCartaoPedido = 'CREDITO'
      } else if (!cartaoCreditoDisponivel && cartaoDebitoDisponivel) {
        tipoCartaoPedido = 'DEBITO'
      } else {
        return NextResponse.json({ error: 'Tipo do cartao obrigatorio' }, { status: 400 })
      }
    }

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
    const existingCliente = await prisma.cliente.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [
          { telefone: { in: telefoneCandidates } },
          { whatsapp: { in: telefoneCandidates } },
          ...(whatsappCandidates.length > 0
            ? [
                { telefone: { in: whatsappCandidates } },
                { whatsapp: { in: whatsappCandidates } },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        whatsapp: true,
      },
    })

    const cliente = existingCliente
      ? { id: existingCliente.id }
      : await prisma.cliente.create({
          data: {
            tenantId: tenant.id,
            nome: body.clienteNome.trim(),
            telefone: telefoneLimpo,
            whatsapp: whatsappLimpo || telefoneLimpo,
            clienteBloco: body.clienteBloco?.trim() ?? null,
            clienteApartamento: body.clienteApartamento?.trim() ?? null,
            observacoes: null,
          },
          select: { id: true },
        })

    const clienteNomePedido = existingCliente?.nome?.trim() || body.clienteNome.trim()
    const clienteWhatsappPedido = existingCliente?.whatsapp || whatsappLimpo || telefoneLimpo
    const publicAccessToken = generatePublicOrderAccessToken()

    const novoPedido = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          clienteId: cliente.id,
          status: 'FEITO',
          publicAccessTokenHash: hashPublicOrderAccessToken(publicAccessToken),
          publicAccessTokenIssuedAt: new Date(),
          clienteNome: clienteNomePedido,
          clienteTelefone: telefoneLimpo,
          clienteWhatsapp: clienteWhatsappPedido || null,
          clienteBloco: body.clienteBloco?.trim() ?? null,
          clienteApartamento: body.clienteApartamento?.trim() ?? null,
          pagamento: body.pagamento,
          tipoCartao: tipoCartaoPedido,
          tipoEntrega: body.tipoEntrega,
          encomendaPara: encomendaParaPedido,
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

      await registrarLogOperacao(tx, {
        tenantId: tenant.id,
        tipo: 'PEDIDO_CRIADO',
        descricao: `Pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} criado pelo checkout.`,
        actorNome: 'Cliente',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id),
        quantidade: pedido.itens.reduce((acc, item) => acc + item.quantidade, 0),
        metadata: {
            origem: 'CHECKOUT',
            tipoEntrega: pedido.tipoEntrega,
            tipoCartao: pedido.tipoCartao,
            statusPagamento: pedido.statusPagamento,
          },
      })

      return pedido
    })

    appLogger.info(`[api/pedidos] Novo pedido criado: ${novoPedido.id}`)

    return NextResponse.json(serializePublicPedido(novoPedido, publicAccessToken), { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar pedido:', error)
    return NextResponse.json(
      { error: 'Erro interno ao processar pedido' },
      { status: 500 }
    )
  }
}

// Historico por telefone foi desativado para evitar exposicao de dados pessoais.
export async function GET() {
  return NextResponse.json({ error: 'Metodo nao permitido' }, { status: 405 })
}
