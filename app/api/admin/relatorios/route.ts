import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

function getPeriodRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${to}T24:00:00-03:00`),
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get('from') || today,
    to: request.nextUrl.searchParams.get('to') || today,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const { from, to } = parsed.data
  const { start, end } = getPeriodRange(from, to)
  if (start > end) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const pedidos = await prisma.pedido.findMany({
    where: {
      tenantId: admin.tenantId,
      OR: [
        {
          tipoEntrega: { not: 'ENCOMENDA' },
          criadoEm: { gte: start, lt: end },
        },
        {
          tipoEntrega: 'ENCOMENDA',
          encomendaPara: { gte: start, lt: end },
        },
      ],
    },
    include: { itens: true },
    orderBy: [{ encomendaPara: 'asc' }, { criadoEm: 'asc' }],
  })

  const porStatus = {
    FEITO: 0,
    ACEITO: 0,
    PREPARACAO: 0,
    ENTREGUE: 0,
    CANCELADO: 0,
  }

  const produtos = new Map<string, {
    chave: string
    produtoId: string
    nomeProduto: string
    precoUnitario: number
    quantidade: number
    total: number
    pedidos: number
  }>()

  for (const pedido of pedidos) {
    porStatus[pedido.status] += 1

    for (const item of pedido.itens) {
      const chave = `${item.produtoId}:${item.precoUnitarioSnapshot}`
      const current = produtos.get(chave) ?? {
        chave,
        produtoId: item.produtoId,
        nomeProduto: item.nomeProdutoSnapshot,
        precoUnitario: item.precoUnitarioSnapshot,
        quantidade: 0,
        total: 0,
        pedidos: 0,
      }

      current.quantidade += item.quantidade
      current.total += item.totalItem
      current.pedidos += 1
      produtos.set(chave, current)
    }
  }

  const entregues = pedidos.filter((pedido) => pedido.status === 'ENTREGUE')
  const cancelados = pedidos.filter((pedido) => pedido.status === 'CANCELADO')
  const receitaTotal = pedidos.reduce((acc, pedido) => acc + pedido.total, 0)
  const receitaEntregue = entregues.reduce((acc, pedido) => acc + pedido.total, 0)
  const totalCancelado = cancelados.reduce((acc, pedido) => acc + pedido.total, 0)

  return NextResponse.json({
    from,
    to,
    totalPedidos: pedidos.length,
    receitaTotal,
    receitaEntregue,
    totalCancelado,
    ticketMedioGeral: pedidos.length ? Math.round(receitaTotal / pedidos.length) : 0,
    ticketMedioEntregue: entregues.length ? Math.round(receitaEntregue / entregues.length) : 0,
    porStatus,
    produtos: Array.from(produtos.values()).sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
      return a.nomeProduto.localeCompare(b.nomeProduto)
    }),
    pedidos: pedidos.map((pedido) => ({
      id: pedido.id,
      numero: pedido.id.slice(-8).toUpperCase(),
      status: pedido.status,
      statusPagamento: pedido.statusPagamento,
      clienteNome: pedido.clienteNome,
      tipoEntrega: pedido.tipoEntrega,
      encomendaPara: pedido.encomendaPara,
      criadoEm: pedido.criadoEm,
      total: pedido.total,
      itens: pedido.itens.map((item) => ({
        id: item.id,
        nomeProduto: item.nomeProdutoSnapshot,
        precoUnitario: item.precoUnitarioSnapshot,
        quantidade: item.quantidade,
        totalItem: item.totalItem,
      })),
    })),
  })
}
