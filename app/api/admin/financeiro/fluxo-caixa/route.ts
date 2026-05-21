import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { calcularLiquidoPedido, getContaPagarStatusFinanceiro, getPedidoFinanceiroStatus, groupByDateKey } from '@/lib/finance'
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

function enumerateDateKeys(from: string, to: string) {
  const keys: string[] = []
  let cursor = new Date(`${from}T12:00:00-03:00`)
  const end = new Date(`${to}T12:00:00-03:00`)

  while (cursor <= end) {
    keys.push(groupByDateKey(cursor))
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }

  return keys
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const today = todayInSaoPaulo()
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get('from') || today,
      to: request.nextUrl.searchParams.get('to') || today,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })

    const { from, to } = parsed.data
    const { start, end } = getPeriodRange(from, to)

    const [pedidos, contasPagar] = await Promise.all([
      prisma.pedido.findMany({
        where: {
          tenantId: admin.tenantId,
          OR: [
            { tipoEntrega: { not: 'ENCOMENDA' }, criadoEm: { gte: start, lt: end } },
            { tipoEntrega: 'ENCOMENDA', encomendaPara: { gte: start, lt: end } },
          ],
        },
      }),
      prisma.contaPagar.findMany({
        where: {
          tenantId: admin.tenantId,
          OR: [{ vencimento: { gte: start, lt: end } }, { pagoEm: { gte: start, lt: end } }],
        },
        orderBy: [{ vencimento: 'asc' }, { criadoEm: 'asc' }],
      }),
    ])

    const rows = new Map<
      string,
      {
        data: string
        entradasPrevistas: number
        entradasRealizadas: number
        saidasPrevistas: number
        saidasRealizadas: number
        taxasPrevistas: number
        taxasRealizadas: number
        saldoPrevisto: number
        saldoRealizado: number
      }
    >()

    for (const key of enumerateDateKeys(from, to)) {
      rows.set(key, {
        data: key,
        entradasPrevistas: 0,
        entradasRealizadas: 0,
        saidasPrevistas: 0,
        saidasRealizadas: 0,
        taxasPrevistas: 0,
        taxasRealizadas: 0,
        saldoPrevisto: 0,
        saldoRealizado: 0,
      })
    }

    for (const pedido of pedidos) {
      const dataCompetencia =
        pedido.tipoEntrega === 'ENCOMENDA' && pedido.encomendaPara ? pedido.encomendaPara : pedido.criadoEm
      const key = groupByDateKey(dataCompetencia)
      const row = rows.get(key)
      if (!row) continue

      const statusFinanceiro = getPedidoFinanceiroStatus(pedido)
      const { taxa, liquido } = calcularLiquidoPedido(pedido)
      if (statusFinanceiro === 'PREVISTO') {
        row.entradasPrevistas += liquido
        row.taxasPrevistas += taxa
      }
      if (statusFinanceiro === 'REALIZADO') {
        row.entradasRealizadas += liquido
        row.taxasRealizadas += taxa
      }
    }

    for (const conta of contasPagar) {
      const statusFinanceiro = getContaPagarStatusFinanceiro(conta)
      if (statusFinanceiro === 'CANCELADO') continue

      const dataReferencia = statusFinanceiro === 'REALIZADO' && conta.pagoEm ? conta.pagoEm : conta.vencimento
      const key = groupByDateKey(dataReferencia)
      const row = rows.get(key)
      if (!row) continue

      if (statusFinanceiro === 'PREVISTO') {
        row.saidasPrevistas += conta.valor
      } else {
        row.saidasRealizadas += conta.valor
      }
    }

    let saldoPrevistoAcumulado = 0
    let saldoRealizadoAcumulado = 0
    const dias = Array.from(rows.values())
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((row) => {
        saldoPrevistoAcumulado += row.entradasPrevistas - row.saidasPrevistas
        saldoRealizadoAcumulado += row.entradasRealizadas - row.saidasRealizadas
        return {
          ...row,
          saldoPrevisto: saldoPrevistoAcumulado,
          saldoRealizado: saldoRealizadoAcumulado,
        }
      })

    const resumo = dias.reduce(
      (acc, dia) => {
        acc.entradasPrevistas += dia.entradasPrevistas
        acc.entradasRealizadas += dia.entradasRealizadas
        acc.saidasPrevistas += dia.saidasPrevistas
        acc.saidasRealizadas += dia.saidasRealizadas
        acc.taxasPrevistas += dia.taxasPrevistas
        acc.taxasRealizadas += dia.taxasRealizadas
        return acc
      },
      {
        entradasPrevistas: 0,
        entradasRealizadas: 0,
        saidasPrevistas: 0,
        saidasRealizadas: 0,
        taxasPrevistas: 0,
        taxasRealizadas: 0,
      }
    )

    return NextResponse.json({
      from,
      to,
      resumo: {
        ...resumo,
        saldoPrevisto: resumo.entradasPrevistas - resumo.saidasPrevistas,
        saldoRealizado: resumo.entradasRealizadas - resumo.saidasRealizadas,
      },
      dias,
    })
  } catch (error) {
    return handleApiError('api/admin/financeiro/fluxo-caixa GET', error, 'Erro ao carregar fluxo de caixa')
  }
}
