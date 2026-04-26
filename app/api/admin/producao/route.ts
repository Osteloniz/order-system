import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { numeroPedidoCurto } from '@/lib/operation-log'
import { addAvailableStock, consumeAvailableStock, reserveFromAvailableStock, releaseReservedToAvailableStock, setAvailableStock } from '@/lib/stock'

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
    adminPassword: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal('ADD_PRODUCTION'),
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(9999),
    dataProducao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  z.object({
    action: z.literal('MARK_ITEM_PREPARED'),
    itemPedidoId: z.string().uuid(),
    prepared: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal('SYNC_LEGACY_STOCK'),
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

function parseProductionDate(value: string) {
  return new Date(`${value}T12:00:00-03:00`)
}

function formatDateInSaoPaulo(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
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

function addResumo(
  map: Map<string, ProdutoResumo>,
  item: {
    produtoId: string
    nomeProdutoSnapshot: string
    quantidade: number
    totalItem: number
  },
  estoqueMap: Map<string, { quantidadeDisponivel: number; quantidadeReservada: number }>
) {
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

  const [pedidos, produtos, estoques, producaoRegistros, legacyPedidosPendentes] = await Promise.all([
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
    prisma.producaoRegistro.findMany({
      where: {
        tenantId: admin.tenantId,
        dataProducao: { gte: start, lt: end },
      },
      include: {
        produto: { select: { id: true, nome: true } },
      },
      orderBy: [{ dataProducao: 'desc' }, { criadoEm: 'desc' }],
    }),
    prisma.pedido.findMany({
      where: {
        tenantId: admin.tenantId,
        tipoEntrega: { not: 'ENCOMENDA' },
        status: 'ENTREGUE',
        estoqueBaixadoEm: null,
      },
      include: { itens: true },
    }),
  ])

  const estoqueMap = new Map(estoques.map((estoque) => [estoque.produtoId, {
    quantidadeDisponivel: estoque.quantidadeDisponivel,
    quantidadeReservada: estoque.quantidadeReservada,
  }]))
  const legacyResumoMap = new Map<string, number>()
  for (const pedido of legacyPedidosPendentes) {
    for (const item of pedido.itens) {
      legacyResumoMap.set(item.produtoId, (legacyResumoMap.get(item.produtoId) ?? 0) + item.quantidade)
    }
  }

  const pedidosAbertos = pedidos.filter((pedido) => pedido.status !== 'ENTREGUE' && pedido.status !== 'CANCELADO')
  const pedidosNormaisAProduzir = pedidosAbertos.filter((pedido) => pedido.tipoEntrega !== 'ENCOMENDA' && pedido.status === 'FEITO')
  const pedidosEncomendaAProduzir = pedidosAbertos.filter((pedido) => pedido.tipoEntrega === 'ENCOMENDA')

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
    const pendenteBaixaLegada = legacyResumoMap.get(produto.id) ?? 0
    return {
      produtoId: produto.id,
      nomeProduto: produto.nome,
      categoriaNome: produto.categoria?.nome ?? 'Sem categoria',
      quantidadeDisponivel: current.quantidadeDisponivel,
      quantidadeReservada: current.quantidadeReservada,
      pendenteBaixaLegada,
      saldoProjetado: current.quantidadeDisponivel - pendenteBaixaLegada,
    }
  })

  const pedidosLegadosPendentesLista = legacyPedidosPendentes.map((pedido) => {
    const itens = pedido.itens.map((item) => {
      const estoqueAtual = estoqueMap.get(item.produtoId) ?? { quantidadeDisponivel: 0, quantidadeReservada: 0 }
      const estoqueSuficiente = estoqueAtual.quantidadeDisponivel >= item.quantidade

      return {
        produtoId: item.produtoId,
        nomeProduto: item.nomeProdutoSnapshot,
        quantidade: item.quantidade,
        estoqueDisponivelAtual: estoqueAtual.quantidadeDisponivel,
        estoqueSuficiente,
        saldoAposBaixaItem: estoqueAtual.quantidadeDisponivel - item.quantidade,
      }
    })

    return {
      id: pedido.id,
      numero: pedido.id.slice(-8).toUpperCase(),
      status: pedido.status,
      clienteNome: pedido.clienteNome,
      criadoEm: pedido.criadoEm,
      estoqueBaixadoEm: pedido.estoqueBaixadoEm,
      totalItens: itens.reduce((acc, item) => acc + item.quantidade, 0),
      possuiFaltaNoMomento: itens.some((item) => !item.estoqueSuficiente),
      motivo: `Pedido entregue sem baixa registrada no estoque.`,
      itens,
    }
  })

  const historicoMap = new Map<string, { data: string; totalProduzido: number; itens: Map<string, { produtoId: string; nomeProduto: string; quantidade: number }> }>()
  for (const registro of producaoRegistros) {
    const dataChave = formatDateInSaoPaulo(registro.dataProducao)
    const diaAtual = historicoMap.get(dataChave) ?? {
      data: dataChave,
      totalProduzido: 0,
      itens: new Map(),
    }
    diaAtual.totalProduzido += registro.quantidade

    const itemAtual = diaAtual.itens.get(registro.produtoId) ?? {
      produtoId: registro.produtoId,
      nomeProduto: registro.produto.nome,
      quantidade: 0,
    }
    itemAtual.quantidade += registro.quantidade
    diaAtual.itens.set(registro.produtoId, itemAtual)
    historicoMap.set(dataChave, diaAtual)
  }

  const historicoProducao = Array.from(historicoMap.values()).map((dia) => ({
    data: dia.data,
    totalProduzido: dia.totalProduzido,
    itens: Array.from(dia.itens.values()).sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
      return a.nomeProduto.localeCompare(b.nomeProduto)
    }),
  }))

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
    historicoProducao,
    pedidosLegadosPendentes: legacyPedidosPendentes.length,
    pedidosLegadosPendentesLista,
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
    const data = parsed.data
    const adminName = admin.session.user?.name?.toString().trim()
    if (!adminName) {
      return NextResponse.json({ error: 'Sessao do admin invalida. Entre novamente.' }, { status: 401 })
    }

    const adminUser = await prisma.adminUser.findFirst({
      where: {
        tenantId: admin.tenantId,
        nome: adminName,
      },
      select: {
        id: true,
        passwordHash: true,
      },
    })

    if (!adminUser) {
      return NextResponse.json({ error: 'Admin nao encontrado para validar a senha.' }, { status: 403 })
    }

    const passwordOk = await compare(data.adminPassword, adminUser.passwordHash)
    if (!passwordOk) {
      return NextResponse.json({ error: 'Senha do admin incorreta para ajustar o saldo.' }, { status: 403 })
    }

    const produto = await prisma.produto.findFirst({
      where: { id: data.produtoId, tenantId: admin.tenantId },
      select: { id: true },
    })
    if (!produto) {
      return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })
    }

    const estoque = await prisma.$transaction((tx) =>
      setAvailableStock(tx, admin.tenantId, data.produtoId, data.quantidadeDisponivel, {
        tipo: 'AJUSTE_ESTOQUE',
        descricao: 'Ajuste manual de saldo disponivel.',
        actorNome: adminName,
      })
    )

    return NextResponse.json(estoque)
  }

  if (parsed.data.action === 'ADD_PRODUCTION') {
    const data = parsed.data
    const produto = await prisma.produto.findFirst({
      where: { id: data.produtoId, tenantId: admin.tenantId, ativo: true },
      select: { id: true, nome: true },
    })
    if (!produto) {
      return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const registro = await tx.producaoRegistro.create({
        data: {
          tenantId: admin.tenantId,
          produtoId: data.produtoId,
          quantidade: data.quantidade,
          dataProducao: parseProductionDate(data.dataProducao),
        },
      })

      await addAvailableStock(tx, admin.tenantId, data.produtoId, data.quantidade, {
        tipo: 'REGISTRO_PRODUCAO',
        descricao: `Registro de producao do dia ${data.dataProducao}.`,
        actorNome: admin.session.user?.name?.toString().trim() || null,
        pedidoId: null,
        pedidoNumero: null,
        metadata: { dataProducao: data.dataProducao },
        nomeProduto: produto.nome,
      })
      return registro
    })

    return NextResponse.json(result)
  }

  if (parsed.data.action === 'SYNC_LEGACY_STOCK') {
    const pedidosLegados = await prisma.pedido.findMany({
      where: {
        tenantId: admin.tenantId,
        tipoEntrega: { not: 'ENCOMENDA' },
        status: 'ENTREGUE',
        estoqueBaixadoEm: null,
      },
      include: { itens: true },
      orderBy: { criadoEm: 'asc' },
    })

    let sincronizados = 0
    const bloqueados: string[] = []
    const bloqueadosDetalhes: { numero: string; motivo: string }[] = []

    for (const pedido of pedidosLegados) {
      const pedidoNumero = numeroPedidoCurto(pedido.id) ?? pedido.id
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of pedido.itens) {
            await consumeAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
              tipo: 'SINCRONIZACAO_LEGADA',
              descricao: `Baixa de pedido legado #${pedidoNumero} entregue e ainda nao sincronizado.`,
              actorNome: admin.session.user?.name?.toString().trim() || 'Sistema',
              pedidoId: pedido.id,
              pedidoNumero,
            })
          }

          await tx.pedido.update({
            where: { id: pedido.id },
            data: { estoqueBaixadoEm: pedido.estoqueBaixadoEm ?? new Date() },
          })
        })
        sincronizados += 1
      } catch (error) {
        const numero = pedido.id.slice(-8).toUpperCase()
        const motivo = error instanceof Error ? error.message : 'Erro ao sincronizar pedido antigo'
        bloqueados.push(numero)
        bloqueadosDetalhes.push({ numero, motivo })
      }
    }

    return NextResponse.json({
      sincronizados,
      bloqueados,
      bloqueadosDetalhes,
      totalPendentes: pedidosLegados.length,
    })
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (deltaReservado > 0) {
        await reserveFromAvailableStock(tx, admin.tenantId, item.produtoId, deltaReservado, item.nomeProdutoSnapshot, {
          tipo: 'RESERVA_ENCOMENDA',
          descricao: `Reserva manual na producao para o pedido #${numeroPedidoCurto(item.pedido.id) ?? item.pedido.id}.`,
          actorNome: admin.session.user?.name?.toString().trim() || null,
          pedidoId: item.pedido.id,
          pedidoNumero: numeroPedidoCurto(item.pedido.id),
        })
      } else if (deltaReservado < 0) {
        await releaseReservedToAvailableStock(tx, admin.tenantId, item.produtoId, Math.abs(deltaReservado), {
          tipo: 'LIBERACAO_RESERVA',
          descricao: `Liberacao manual da reserva na producao para o pedido #${numeroPedidoCurto(item.pedido.id) ?? item.pedido.id}.`,
          actorNome: admin.session.user?.name?.toString().trim() || null,
          pedidoId: item.pedido.id,
          pedidoNumero: numeroPedidoCurto(item.pedido.id),
          nomeProduto: item.nomeProdutoSnapshot,
        })
      }

      return tx.itemPedido.update({
        where: { id: item.id },
        data: {
          quantidadePreparada: quantidadeNova,
          preparadoEm: shouldPrepare ? new Date() : null,
        },
      })
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao marcar producao' },
      { status: 400 }
    )
  }
}
