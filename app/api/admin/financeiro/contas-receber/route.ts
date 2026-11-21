import { caixaDeliveryPeriod, caixaFinanceMovements, legacyFinancePeriod } from '@/lib/caixa-finance'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { calcularLiquidoPedido, getPedidoFinanceiroStatus } from '@/lib/finance'
import { getCurrentMonthRangeInSaoPaulo } from '@/lib/sao-paulo'

export const runtime = 'nodejs'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['TODOS', 'PREVISTO', 'REALIZADO', 'CANCELADO', 'ESTORNADO']).optional(),
}).strict()

function getPeriodRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${to}T24:00:00-03:00`),
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const defaultRange = getCurrentMonthRangeInSaoPaulo()
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get('from') || defaultRange.from,
      to: request.nextUrl.searchParams.get('to') || defaultRange.to,
      status: request.nextUrl.searchParams.get('status') || 'TODOS',
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
    }

    const { from, to, status } = parsed.data
    const { start, end } = getPeriodRange(from, to)

    const [pedidos, movimentosCaixa] = await Promise.all([
      prisma.pedido.findMany({
      where: {
        tenantId: admin.tenantId,
        OR: [
          legacyFinancePeriod(start, end),
          { ...caixaDeliveryPeriod(start, end), statusPagamento: { in: ['PENDENTE', 'CANCELADO'] } },
        ],
      },
      orderBy: [{ encomendaPara: 'desc' }, { criadoEm: 'desc' }],
      }),
      caixaFinanceMovements(admin.tenantId, start, end),
    ])

    const contas = pedidos
      .map((pedido) => {
        const statusFinanceiro = getPedidoFinanceiroStatus(pedido)
        const { taxa, liquido } = calcularLiquidoPedido(pedido)
        const dataCompetencia =
          pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? pedido.encomendaPara : (pedido.entregueEm ?? pedido.criadoEm)

        return {
          id: pedido.id,
          numero: pedido.id.slice(-8).toUpperCase(),
          clienteNome: pedido.clienteNome,
          clienteTelefone: pedido.clienteTelefone,
          pagamento: pedido.pagamento,
          tipoCartao: pedido.tipoCartao,
          statusPedido: pedido.status,
          statusPagamento: pedido.statusPagamento,
          tipoEntrega: pedido.tipoEntrega,
          dataCompetencia,
          total: pedido.total,
          taxa,
          liquido,
          statusFinanceiro,
        }
      })
      .concat(movimentosCaixa.map((movimento) => ({
        id: movimento.id, numero: movimento.pedidoId.slice(-8).toUpperCase(),
        clienteNome: movimento.pedido.clienteNome, clienteTelefone: movimento.pedido.clienteTelefone,
        pagamento: movimento.meio, tipoCartao: movimento.tipoCartao, statusPedido: movimento.pedido.status,
        statusPagamento: movimento.pedido.statusPagamento, tipoEntrega: 'RETIRADA' as const,
        dataCompetencia: movimento.efetivoEm, total: movimento.saida ? -movimento.bruto : movimento.bruto,
        taxa: movimento.taxa, liquido: movimento.saida ? -movimento.liquido : movimento.liquido,
        statusFinanceiro: movimento.saida ? 'ESTORNADO' as const : 'REALIZADO' as const,
      })))
      .sort((a, b) => b.dataCompetencia.getTime() - a.dataCompetencia.getTime())
      .filter((conta) => (status === 'TODOS' ? true : conta.statusFinanceiro === status))

    const resumo = contas.reduce(
      (acc, conta) => {
        acc.totalBruto += conta.total
        acc.totalTaxas += conta.taxa
        acc.totalLiquido += conta.liquido

        if (conta.statusFinanceiro === 'PREVISTO') {
          acc.previsto += conta.total
          acc.previstoLiquido += conta.liquido
        } else if (conta.statusFinanceiro === 'REALIZADO') {
          acc.realizado += conta.total
          acc.realizadoLiquido += conta.liquido
        } else if (conta.statusFinanceiro === 'ESTORNADO') {
          acc.estornado -= conta.total
        } else {
          acc.cancelado += conta.total
        }

        return acc
      },
      {
        totalBruto: 0,
        totalTaxas: 0,
        totalLiquido: 0,
        previsto: 0,
        previstoLiquido: 0,
        realizado: 0,
        realizadoLiquido: 0,
        cancelado: 0,
        estornado: 0,
      }
    )

    return NextResponse.json({
      from,
      to,
      status,
      totalRegistros: contas.length,
      resumo,
      contas,
    })
  } catch (error) {
    return handleApiError('api/admin/financeiro/contas-receber GET', error, 'Erro ao carregar contas a receber')
  }
}
