import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SET_STOCK'),
    produtoId: z.string().uuid(),
    quantidadeDisponivel: z.number().int().min(0).max(9999),
  }).strict(),
  z.object({
    action: z.literal('MARK_ITEM_PREPARED'),
    itemPedidoId: z.string().uuid(),
    prepared: z.boolean(),
  }).strict(),
])

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getPeriodRange(fromParam?: string, toParam?: string, dateParam?: string) {
  const today = todayInSaoPaulo()
  const from = fromParam ?? dateParam ?? today
  const to = toParam ?? dateParam ?? from
  return {
    from,
    to,
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${to}T24:00:00-03:00`),
  }
}

type ProdutoResumo = {
  produtoId: string
  nomeProduto: string
  quantidade: number
  receita: number
  pedidos: number
  estoqueDisponivel: number
  estoqueReservado: number
  aProduzir: number
}

function addResumo(map: Map<string, ProdutoResumo>, item: {
  produtoId: string
  nomeProdutoSnapshot: string
  quantidade: number
  totalItem: number
}, estoqueMap: Map<string, { quantidadeDisponivel: number; quantidadeReservada: number }>) {
  const estoque = estoqueMap.get(item.produtoId) ?? { quantidadeDisponivel: 0, quantidadeReservada: 0 }
  const current = map.get(item.produtoId) ?? {
    produtoId: item.produtoId,
    nomeProduto: item.nomeProdutoSnapshot,
    quantidade: 0,
    receita: 0,
    pedidos: 0,
    estoqueDisponivel: estoque.quantidadeDisponivel,
    estoqueReservado: estoque.quantidadeReservada,
    aProduzir: 0,
  }

  current.quantidade += item.quantidade
  current.receita += item.totalItem
  current.pedidos += 1
  map.set(item.produtoId, current)
}

function sortResumo(items: ProdutoResumo[]) {
  return items.sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
    return a.nomeProduto.localeCompare(b.nomeProduto)
  })
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const parsed = querySchema.safeParse({
    date: request.nextUrl.searchParams.get('date') || undefined,
    from: request.nextUrl.searchParams.get('from') || undefined,
    to: request.nextUrl.searchParams.get('to') || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const { from, to, start, end } = getPeriodRange(parsed.data.from, parsed.data.to, parsed.data.date)
  if (start > end) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const [pedidos, produtos, estoques] = await Promise.all([
    prisma.pedido.findMany({
      where: {
        tenantId: admin.tenantId,
        status: { not: 'CANCELADO' },
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
    }),
    prisma.produto.findMany({
      where: { tenantId: admin.tenantId, ativo: true },
      select: { id: true, nome: true, ordem: true, categoria: { select: { nome: true, ordem: true } } },
      orderBy: [{ categoria: { ordem: 'asc' } }, { ordem: 'asc' }, { nome: 'asc' }],
    }),
    prisma.produtoEstoque.findMany({ where: { tenantId: admin.tenantId } }),
  ])

  const estoqueMap = new Map(estoques.map((estoque) => [estoque.produtoId, {
    quantidadeDisponivel: estoque.quantidadeDisponivel,
    quantidadeReservada: estoque.quantidadeReservada,
  }]))

  const pedidosAProduzir = pedidos.filter((pedido) => pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO')
  const pedidosNormaisAProduzir = pedidosAProduzir.filter((pedido) => pedido.tipoEntrega !== 'ENCOMENDA')
  const pedidosEncomendaAProduzir = pedidosAProduzir.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA')

  const resumoMap = new Map<string, ProdutoResumo>()
  const normalMap = new Map<string, ProdutoResumo>()
  const encomendaMap = new Map<string, ProdutoResumo>()

  for (const pedido of pedidos) {
    for (const item of pedido.itens) addResumo(resumoMap, item, estoqueMap)
  }

  for (const pedido of pedidosNormaisAProduzir) {
    for (const item of pedido.itens) addResumo(normalMap, item, estoqueMap)
  }

  for (const pedido of pedidosEncomendaAProduzir) {
    for (const item of pedido.itens) {
      const pendente = Math.max(0, item.quantidade - item.quantidadePreparada)
      if (pendente === 0) continue
      addResumo(encomendaMap, { ...item, quantidade: pendente, totalItem: 0 }, estoqueMap)
    }
  }

  const aProduzir = sortResumo(Array.from(normalMap.values()).map((item) => ({
    ...item,
    aProduzir: Math.max(0, item.quantidade - item.estoqueDisponivel),
  })))

  const encomendasAProduzir = sortResumo(Array.from(encomendaMap.values()).map((item) => ({
    ...item,
    aProduzir: item.quantidade,
  })))

  const estoque = produtos.map((produto) => {
    const current = estoqueMap.get(produto.id) ?? { quantidadeDisponivel: 0, quantidadeReservada: 0 }
    return {
      produtoId: produto.id,
      nomeProduto: produto.nome,
      categoriaNome: produto.categoria?.nome ?? 'Sem categoria',
      quantidadeDisponivel: current.quantidadeDisponivel,
      quantidadeReservada: current.quantidadeReservada,
    }
  })

  return NextResponse.json({
    from,
    to,
    totalPedidos: pedidos.length,
    totalItens: Array.from(resumoMap.values()).reduce((acc, item) => acc + item.quantidade, 0),
    receitaTotal: pedidos.reduce((acc, pedido) => acc + pedido.total, 0),
    resumo: sortResumo(Array.from(resumoMap.values())),
    aProduzir,
    encomendasAProduzir,
    estoque,
    totalAProduzir: aProduzir.reduce((acc, item) => acc + item.aProduzir, 0),
    totalEncomendasAProduzir: encomendasAProduzir.reduce((acc, item) => acc + item.aProduzir, 0),
    pedidos: pedidos.map((pedido) => ({
      id: pedido.id,
      numero: pedido.id.slice(-8).toUpperCase(),
      status: pedido.status,
      statusPagamento: pedido.statusPagamento,
      clienteNome: pedido.clienteNome,
      clienteBloco: pedido.clienteBloco,
      clienteApartamento: pedido.clienteApartamento,
      tipoEntrega: pedido.tipoEntrega,
      encomendaPara: pedido.encomendaPara,
      total: pedido.total,
      criadoEm: pedido.criadoEm,
      itens: pedido.itens.map((item) => ({
        id: item.id,
        produtoId: item.produtoId,
        nomeProduto: item.nomeProdutoSnapshot,
        quantidade: item.quantidade,
        quantidadePreparada: item.quantidadePreparada,
        preparadoEm: item.preparadoEm,
        totalItem: item.totalItem,
      })),
    })),
  })
}

export async function PATCH(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  if (parsed.data.action === 'SET_STOCK') {
    const produto = await prisma.produto.findFirst({
      where: { id: parsed.data.produtoId, tenantId: admin.tenantId },
      select: { id: true },
    })
    if (!produto) {
      return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })
    }

    const estoque = await prisma.produtoEstoque.upsert({
      where: { tenantId_produtoId: { tenantId: admin.tenantId, produtoId: parsed.data.produtoId } },
      create: {
        tenantId: admin.tenantId,
        produtoId: parsed.data.produtoId,
        quantidadeDisponivel: parsed.data.quantidadeDisponivel,
        quantidadeReservada: 0,
      },
      update: { quantidadeDisponivel: parsed.data.quantidadeDisponivel },
    })

    return NextResponse.json(estoque)
  }

  const item = await prisma.itemPedido.findFirst({
    where: {
      id: parsed.data.itemPedidoId,
      pedido: { tenantId: admin.tenantId, tipoEntrega: 'ENCOMENDA', status: { notIn: ['ENTREGUE', 'CANCELADO'] } },
    },
    include: { pedido: true },
  })
  if (!item) {
    return NextResponse.json({ error: 'Item de encomenda nao encontrado' }, { status: 404 })
  }

  const shouldPrepare = parsed.data.prepared
  const quantidadeAtual = item.quantidadePreparada
  const quantidadeNova = shouldPrepare ? item.quantidade : 0
  const deltaReservado = quantidadeNova - quantidadeAtual

  const result = await prisma.$transaction(async (tx) => {
    const updatedItem = await tx.itemPedido.update({
      where: { id: item.id },
      data: {
        quantidadePreparada: quantidadeNova,
        preparadoEm: shouldPrepare ? new Date() : null,
      },
    })

    if (deltaReservado !== 0) {
      await tx.produtoEstoque.upsert({
        where: { tenantId_produtoId: { tenantId: admin.tenantId, produtoId: item.produtoId } },
        create: {
          tenantId: admin.tenantId,
          produtoId: item.produtoId,
          quantidadeDisponivel: 0,
          quantidadeReservada: Math.max(0, deltaReservado),
        },
        update: {
          quantidadeReservada: { increment: deltaReservado },
        },
      })
    }

    return updatedItem
  })

  return NextResponse.json(result)
}
