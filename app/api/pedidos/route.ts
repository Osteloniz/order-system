import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calcularTotalItem, calcularSubtotal, calcularTotal, calcularFretePorDistancia } from '@/lib/calc'
import type { CriarPedidoPayload } from '@/lib/types'

export const runtime = 'nodejs'

type ItemPedidoCreate = {
  produtoId: string
  nomeProdutoSnapshot: string
  precoUnitarioSnapshot: number
  quantidade: number
  totalItem: number
}

// POST /api/pedidos - Cria um novo pedido
export async function POST(request: NextRequest) {
  try {
    const body: CriarPedidoPayload = await request.json()

    // Validacoes basicas
    if (!body.clienteNome || !body.clienteTelefone || !body.pagamento || !body.tipoEntrega) {
      return NextResponse.json(
        { error: 'Dados incompletos' },
        { status: 400 }
      )
    }

    if (body.tipoEntrega === 'ENTREGA' && !body.enderecoEntrega) {
      return NextResponse.json(
        { error: 'Endereco de entrega e obrigatorio' },
        { status: 400 }
      )
    }
    if (body.tipoEntrega === 'ENTREGA' && (!body.distanciaKm || body.distanciaKm <= 0)) {
      return NextResponse.json(
        { error: 'Distancia e obrigatoria para calcular o frete' },
        { status: 400 }
      )
    }

    if (!body.itens || body.itens.length === 0) {
      return NextResponse.json(
        { error: 'Pedido deve ter pelo menos um item' },
        { status: 400 }
      )
    }

    const itens: ItemPedidoCreate[] = []

    // Criar itens do pedido com snapshot
    for (const item of body.itens) {
      const produto = await prisma.produto.findFirst({
        where: { id: item.produtoId, ativo: true }
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
    const configuracao = await prisma.configuracao.findFirst()
    const frete = body.tipoEntrega === 'ENTREGA' && configuracao
      ? calcularFretePorDistancia({
          distanciaKm: body.distanciaKm ?? 0,
          freteBase: configuracao.freteBase,
          freteRaioKm: configuracao.freteRaioKm,
          freteKmExcedente: configuracao.freteKmExcedente
        })
      : 0

    let cupomId: string | undefined
    let cupomCodigoSnapshot: string | undefined
    let descontoValor = 0

    if (body.cupomCodigo) {
      const codigo = body.cupomCodigo.trim().toUpperCase()
      const cupom = await prisma.cupom.findUnique({
        where: { codigo }
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
          clienteNome: body.clienteNome,
          clienteTelefone: body.clienteTelefone.replace(/\D/g, ''),
          pagamento: body.pagamento,
          tipoEntrega: body.tipoEntrega,
          enderecoEntrega: body.enderecoEntrega,
          enderecoRetirada: configuracao?.enderecoRetirada ?? '',
          frete,
          subtotal,
          total: Math.max(0, total),
          motivoCancelamento: null,
          distanciaKm: body.distanciaKm ?? null,
          descontoValor: descontoValor > 0 ? descontoValor : null,
          cupomCodigoSnapshot: cupomCodigoSnapshot ?? null,
          cupomId: cupomId ?? null,
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

// GET /api/pedidos?telefone=... - Historico por telefone (opcional)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const telefone = searchParams.get('telefone')

  if (telefone) {
    const telefoneLimpo = telefone.replace(/\D/g, '')
    const pedidosCliente = await prisma.pedido.findMany({
      where: { clienteTelefone: telefoneLimpo },
      include: { itens: true },
      orderBy: { criadoEm: 'desc' }
    })
    return NextResponse.json(pedidosCliente)
  }

  return NextResponse.json({ error: 'Telefone nao informado' }, { status: 400 })
}
