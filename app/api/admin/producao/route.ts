import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()

function getDayRange(dateParam?: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const date = dateParam ?? formatter.format(new Date())
  const start = new Date(`${date}T00:00:00-03:00`)
  const end = new Date(`${date}T24:00:00-03:00`)
  return { date, start, end }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const parsed = querySchema.safeParse({
    date: request.nextUrl.searchParams.get('date') || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Data invalida' }, { status: 400 })
  }

  const { date, start, end } = getDayRange(parsed.data.date)

  const pedidos = await prisma.pedido.findMany({
    where: {
      tenantId: admin.tenantId,
      criadoEm: {
        gte: start,
        lt: end,
      },
      status: {
        not: 'CANCELADO',
      },
    },
    include: { itens: true },
    orderBy: { criadoEm: 'asc' },
  })

  const pedidosAProduzir = pedidos.filter((pedido) => {
    return pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO'
  })

  const produtos = new Map<string, {
    produtoId: string
    nomeProduto: string
    quantidade: number
    receita: number
    pedidos: number
  }>()

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const current = produtos.get(item.produtoId) ?? {
        produtoId: item.produtoId,
        nomeProduto: item.nomeProdutoSnapshot,
        quantidade: 0,
        receita: 0,
        pedidos: 0,
      }

      current.quantidade += item.quantidade
      current.receita += item.totalItem
      current.pedidos += 1
      produtos.set(item.produtoId, current)
    }
  }

  const resumo = Array.from(produtos.values()).sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
    return a.nomeProduto.localeCompare(b.nomeProduto)
  })

  const produtosAProduzir = new Map<string, {
    produtoId: string
    nomeProduto: string
    quantidade: number
    receita: number
    pedidos: number
  }>()

  for (const pedido of pedidosAProduzir) {
    for (const item of pedido.itens) {
      const current = produtosAProduzir.get(item.produtoId) ?? {
        produtoId: item.produtoId,
        nomeProduto: item.nomeProdutoSnapshot,
        quantidade: 0,
        receita: 0,
        pedidos: 0,
      }

      current.quantidade += item.quantidade
      current.receita += item.totalItem
      current.pedidos += 1
      produtosAProduzir.set(item.produtoId, current)
    }
  }

  const aProduzir = Array.from(produtosAProduzir.values()).sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
    return a.nomeProduto.localeCompare(b.nomeProduto)
  })

  return NextResponse.json({
    date,
    totalPedidos: pedidos.length,
    totalItens: resumo.reduce((acc, item) => acc + item.quantidade, 0),
    receitaTotal: pedidos.reduce((acc, pedido) => acc + pedido.total, 0),
    resumo,
    aProduzir,
    totalAProduzir: aProduzir.reduce((acc, item) => acc + item.quantidade, 0),
    pedidos: pedidos.map((pedido) => ({
      id: pedido.id,
      numero: pedido.id.slice(-8).toUpperCase(),
      status: pedido.status,
      statusPagamento: pedido.statusPagamento,
      clienteNome: pedido.clienteNome,
      clienteBloco: pedido.clienteBloco,
      clienteApartamento: pedido.clienteApartamento,
      tipoEntrega: pedido.tipoEntrega,
      total: pedido.total,
      criadoEm: pedido.criadoEm,
      itens: pedido.itens.map((item) => ({
        id: item.id,
        nomeProduto: item.nomeProdutoSnapshot,
        quantidade: item.quantidade,
        totalItem: item.totalItem,
      })),
    })),
  })
}
