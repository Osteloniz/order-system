import { NextRequest, NextResponse } from 'next/server'
import { pedidos, produtos, configuracao, gerarId } from '@/lib/mock-db'
import { calcularTotalItem, calcularSubtotal, calcularTotal } from '@/lib/calc'
import type { CriarPedidoPayload, Pedido, ItemPedido } from '@/lib/types'

// POST /api/pedidos - Cria um novo pedido
export async function POST(request: NextRequest) {
  try {
    const body: CriarPedidoPayload = await request.json()

    // Validações básicas
    if (!body.clienteNome || !body.clienteTelefone || !body.pagamento || !body.tipoEntrega) {
      return NextResponse.json(
        { error: 'Dados incompletos' },
        { status: 400 }
      )
    }

    if (body.tipoEntrega === 'ENTREGA' && !body.enderecoEntrega) {
      return NextResponse.json(
        { error: 'Endereço de entrega é obrigatório' },
        { status: 400 }
      )
    }

    if (!body.itens || body.itens.length === 0) {
      return NextResponse.json(
        { error: 'Pedido deve ter pelo menos um item' },
        { status: 400 }
      )
    }

    const pedidoId = gerarId('ped')
    const itens: ItemPedido[] = []

    // Criar itens do pedido com snapshot
    for (const item of body.itens) {
      const produto = produtos.find(p => p.id === item.produtoId && p.ativo)
      if (!produto) {
        return NextResponse.json(
          { error: `Produto não encontrado ou indisponível: ${item.produtoId}` },
          { status: 400 }
        )
      }

      const totalItem = calcularTotalItem(produto.preco, item.quantidade)
      
      itens.push({
        id: gerarId('item'),
        pedidoId,
        produtoId: produto.id,
        nomeProdutoSnapshot: produto.nome,
        precoUnitarioSnapshot: produto.preco,
        quantidade: item.quantidade,
        totalItem
      })
    }

    const subtotal = calcularSubtotal(itens)
    const frete = body.tipoEntrega === 'ENTREGA' ? configuracao.freteFixo : 0
    const total = calcularTotal(subtotal, frete)

    const novoPedido: Pedido = {
      id: pedidoId,
      status: 'FEITO',
      clienteNome: body.clienteNome,
      clienteTelefone: body.clienteTelefone.replace(/\D/g, ''),
      pagamento: body.pagamento,
      tipoEntrega: body.tipoEntrega,
      enderecoEntrega: body.enderecoEntrega,
      enderecoRetirada: configuracao.enderecoRetirada,
      frete,
      subtotal,
      total,
      criadoEm: new Date().toISOString(),
      itens
    }

    // Adiciona ao array (mock DB)
    pedidos.unshift(novoPedido)

    console.log(`[v0] Novo pedido criado: ${pedidoId}`)

    return NextResponse.json(novoPedido, { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar pedido:', error)
    return NextResponse.json(
      { error: 'Erro interno ao processar pedido' },
      { status: 500 }
    )
  }
}

// GET /api/pedidos?telefone=... - Histórico por telefone (opcional)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const telefone = searchParams.get('telefone')

  if (telefone) {
    const telefoneLimpo = telefone.replace(/\D/g, '')
    const pedidosCliente = pedidos.filter(p => p.clienteTelefone === telefoneLimpo)
    return NextResponse.json(pedidosCliente)
  }

  return NextResponse.json({ error: 'Telefone não informado' }, { status: 400 })
}
