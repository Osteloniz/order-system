import { NextRequest, NextResponse } from 'next/server'
import type { LogOperacaoTipo } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.string().trim().optional(),
  busca: z.string().trim().optional(),
}).strict()

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

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

  const today = todayInSaoPaulo()
  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get('from') || today,
    to: request.nextUrl.searchParams.get('to') || today,
    tipo: request.nextUrl.searchParams.get('tipo') || undefined,
    busca: request.nextUrl.searchParams.get('busca') || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros invalidos' }, { status: 400 })
  }

  const { from, to, tipo, busca } = parsed.data
  const { start, end } = getPeriodRange(from, to)
  if (start > end) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const logs = await prisma.logOperacao.findMany({
    where: {
      tenantId: admin.tenantId,
      criadoEm: { gte: start, lt: end },
      ...(tipo && tipo !== 'TODOS' ? { tipo: tipo as LogOperacaoTipo } : {}),
      ...(busca
        ? {
            OR: [
              { descricao: { contains: busca, mode: 'insensitive' } },
              { produtoNome: { contains: busca, mode: 'insensitive' } },
              { pedidoNumero: { contains: busca, mode: 'insensitive' } },
              { actorNome: { contains: busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { criadoEm: 'desc' },
    take: 500,
  })

  const contagemPorTipo = logs.reduce<Record<string, number>>((acc, log) => {
    acc[log.tipo] = (acc[log.tipo] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    from,
    to,
    total: logs.length,
    resumo: {
      ajustes: contagemPorTipo.AJUSTE_ESTOQUE ?? 0,
      producoes: contagemPorTipo.REGISTRO_PRODUCAO ?? 0,
      baixasEntrega: contagemPorTipo.BAIXA_ESTOQUE_ENTREGA ?? 0,
      reservas: (contagemPorTipo.RESERVA_ENCOMENDA ?? 0) + (contagemPorTipo.LIBERACAO_RESERVA ?? 0),
      pedidos: (contagemPorTipo.PEDIDO_CRIADO ?? 0) + (contagemPorTipo.PEDIDO_EDITADO ?? 0) + (contagemPorTipo.PEDIDO_STATUS_ALTERADO ?? 0),
    },
    logs: logs.map((log) => ({
      id: log.id,
      tipo: log.tipo,
      produtoId: log.produtoId,
      produtoNome: log.produtoNome,
      pedidoId: log.pedidoId,
      pedidoNumero: log.pedidoNumero,
      quantidade: log.quantidade,
      saldoDisponivel: log.saldoDisponivel,
      saldoReservado: log.saldoReservado,
      descricao: log.descricao,
      actorNome: log.actorNome,
      criadoEm: log.criadoEm,
    })),
  })
}
