import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { hasFornecedorFinanceiroSchema } from '@/lib/fornecedores-financeiros'
import { getMimoLogMetadata } from '@/lib/mimos'
import { calcularTaxaCartao, isPedidoRealizadoFinanceiramente, normalizeTipoCartao } from '@/lib/order-finance'
import { todayInSaoPaulo } from '@/lib/sao-paulo'

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

function getContaPagarFornecedorNome(conta: { fornecedor?: string | null } & { fornecedorFinanceiro?: { nome: string } | null }) {
  return conta.fornecedorFinanceiro?.nome ?? conta.fornecedor?.trim() ?? ''
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const today = todayInSaoPaulo()
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

    const hasStructuredSchema = await hasFornecedorFinanceiroSchema()
    const [pedidos, contasPagar, logsOperacionais] = await Promise.all([
      prisma.pedido.findMany({
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
      }),
      hasStructuredSchema
        ? prisma.contaPagar.findMany({
            where: {
              tenantId: admin.tenantId,
              vencimento: { gte: start, lt: end },
            },
            include: {
              fornecedorFinanceiro: {
                select: {
                  nome: true,
                },
              },
            },
            orderBy: { vencimento: 'asc' },
          })
        : prisma.contaPagar.findMany({
            where: {
              tenantId: admin.tenantId,
              vencimento: { gte: start, lt: end },
            },
            orderBy: { vencimento: 'asc' },
          }),
      prisma.logOperacao.findMany({
        where: {
          tenantId: admin.tenantId,
          criadoEm: { gte: start, lt: end },
          tipo: 'AJUSTE_ESTOQUE',
        },
        select: {
          quantidade: true,
          metadata: true,
        },
      }),
    ])

    const porStatus = {
      FEITO: 0,
      ACEITO: 0,
      PREPARACAO: 0,
      ENTREGUE: 0,
      CANCELADO: 0,
    }

    const produtos = new Map<
      string,
      {
        chave: string
        produtoId: string
        nomeProduto: string
        precoUnitario: number
        quantidade: number
        total: number
        pedidos: number
      }
    >()

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
    const pagamentosPendentes = pedidos.filter((pedido) => pedido.statusPagamento === 'PENDENTE')
    const pedidosRealizados = pedidos.filter((pedido) => isPedidoRealizadoFinanceiramente(pedido))
    const pedidosPrevistos = pedidos.filter(
      (pedido) => pedido.status !== 'CANCELADO' && !isPedidoRealizadoFinanceiramente(pedido)
    )
    const cartaoEntregue = entregues.filter((pedido) => pedido.pagamento === 'CARTAO')
    const cartaoPrevisto = pedidosPrevistos.filter((pedido) => pedido.pagamento === 'CARTAO')
    const cartaoRealizado = pedidosRealizados.filter((pedido) => pedido.pagamento === 'CARTAO')
    const contasPagarPendentes = contasPagar.filter((conta) => conta.status === 'PENDENTE')
    const contasPagarPagas = contasPagar.filter((conta) => conta.status === 'PAGO')
    const contasPagarCanceladas = contasPagar.filter((conta) => conta.status === 'CANCELADO')

    const receitaTotal = pedidos.reduce((acc, pedido) => acc + pedido.total, 0)
    const receitaEntregue = entregues.reduce((acc, pedido) => acc + pedido.total, 0)
    const totalCancelado = cancelados.reduce((acc, pedido) => acc + pedido.total, 0)
    const receitaCartaoBruta = cartaoEntregue.reduce((acc, pedido) => acc + pedido.total, 0)
    const taxaCartao = cartaoEntregue.reduce(
      (acc, pedido) => acc + calcularTaxaCartao(pedido.total, normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao)),
      0
    )
    const receitaCartaoLiquida = Math.max(0, receitaCartaoBruta - taxaCartao)
    const recebimentoPrevisto = pedidosPrevistos.reduce((acc, pedido) => acc + pedido.total, 0)
    const recebimentoRealizado = pedidosRealizados.reduce((acc, pedido) => acc + pedido.total, 0)
    const recebimentoEmAberto = pedidosPrevistos.reduce((acc, pedido) => acc + pedido.total, 0)
    const taxaCartaoPrevista = cartaoPrevisto.reduce(
      (acc, pedido) => acc + calcularTaxaCartao(pedido.total, normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao)),
      0
    )
    const taxaCartaoRealizada = cartaoRealizado.reduce(
      (acc, pedido) => acc + calcularTaxaCartao(pedido.total, normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao)),
      0
    )
    const cartaoCreditoBruto = cartaoEntregue
      .filter((pedido) => normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao) === 'CREDITO')
      .reduce((acc, pedido) => acc + pedido.total, 0)
    const cartaoDebitoBruto = cartaoEntregue
      .filter((pedido) => normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao) === 'DEBITO')
      .reduce((acc, pedido) => acc + pedido.total, 0)
    const custosPendentes = contasPagarPendentes.reduce((acc, conta) => acc + conta.valor, 0)
    const custosPagos = contasPagarPagas.reduce((acc, conta) => acc + conta.valor, 0)
    const custosCancelados = contasPagarCanceladas.reduce((acc, conta) => acc + conta.valor, 0)
    const custosTotal = contasPagar
      .filter((conta) => conta.status !== 'CANCELADO')
      .reduce((acc, conta) => acc + conta.valor, 0)
    const resultadoRealizado = recebimentoRealizado - custosPagos
    const mimosConcedidos = logsOperacionais.reduce((acc, log) => {
      const metadata = getMimoLogMetadata(log.metadata)
      if (!metadata) return acc
      return acc + Math.max(Math.abs(log.quantidade ?? 0), metadata.quantidadeMimo ?? 0, 1)
    }, 0)
    const valorMimosConcedidos = logsOperacionais.reduce((acc, log) => {
      const metadata = getMimoLogMetadata(log.metadata)
      if (!metadata) return acc
      const quantidade = Math.max(Math.abs(log.quantidade ?? 0), metadata.quantidadeMimo ?? 0, 1)
      return acc + (metadata.valorReferencial ?? 0) * quantidade
    }, 0)
    const fornecedores = Array.from(
      contasPagar.reduce((acc, conta) => {
        if (conta.status === 'CANCELADO') return acc

        const nome = getContaPagarFornecedorNome(conta)
        if (!nome) return acc

        const atual = acc.get(nome) ?? {
          nome,
          quantidade: 0,
          total: 0,
          pago: 0,
          pendente: 0,
        }

        atual.quantidade += 1
        atual.total += conta.valor
        if (conta.status === 'PAGO') atual.pago += conta.valor
        if (conta.status === 'PENDENTE') atual.pendente += conta.valor
        acc.set(nome, atual)
        return acc
      }, new Map<string, { nome: string; quantidade: number; total: number; pago: number; pendente: number }>())
        .values()
    ).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.nome.localeCompare(b.nome)
    })

    return NextResponse.json({
      from,
      to,
      totalPedidos: pedidos.length,
      receitaTotal,
      receitaEntregue,
      totalCancelado,
      valorCancelado: totalCancelado,
      pagamentosPendentes: pagamentosPendentes.length,
      receitaCartaoBruta,
      taxaCartao,
      receitaCartaoLiquida,
      mimosConcedidos,
      valorMimosConcedidos,
      recebimentoPrevisto,
      recebimentoRealizado,
      recebimentoEmAberto,
      taxaCartaoPrevista,
      taxaCartaoRealizada,
      cartaoCreditoBruto,
      cartaoDebitoBruto,
      custosTotal,
      custosPendentes,
      custosPagos,
      custosCancelados,
      resultadoRealizado,
      fornecedores,
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
        clienteTelefone: pedido.clienteTelefone,
        clienteWhatsapp: pedido.clienteWhatsapp,
        pagamento: pedido.pagamento,
        tipoCartao: pedido.tipoCartao,
        responsavelPedido: pedido.responsavelPedido,
        destinatariosPedido: pedido.destinatariosPedido,
        separacaoResponsavel: pedido.separacaoResponsavel,
        observacoesPedido: pedido.observacoesPedido,
        levadoEm: pedido.levadoEm,
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
  } catch (error) {
    return handleApiError('api/admin/relatorios GET', error, 'Erro ao carregar relatorios')
  }
}
