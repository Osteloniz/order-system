import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import {
  buildMercadoPagoPollNotificationId,
  shouldSyncPendingMercadoPagoPix,
  syncMercadoPagoPaymentById,
} from '@/lib/mercado-pago-sync'
import { OPEN_ORDER_STATUSES } from '@/lib/order-status'
import { todayInSaoPaulo } from '@/lib/sao-paulo'

export const runtime = 'nodejs'

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getStartOfDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00-03:00`)
}

function getEndExclusive(dateKey: string, extraDays: number) {
  const start = getStartOfDay(dateKey)
  start.setDate(start.getDate() + extraDays + 1)
  return start
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const date = request.nextUrl.searchParams.get('date') || todayInSaoPaulo()
  const windowDaysRaw = Number(request.nextUrl.searchParams.get('windowDays') || 2)
  const windowDays = Number.isInteger(windowDaysRaw)
    ? Math.max(0, Math.min(windowDaysRaw, 7))
    : 2

  if (!isValidDateKey(date)) {
    return NextResponse.json({ error: 'Data invalida' }, { status: 400 })
  }

  const referenceEndExclusive = getEndExclusive(date, 0)
  const agendaEndExclusive = getEndExclusive(date, windowDays)

  let orders = await prisma.pedido.findMany({
    where: {
      tenantId: admin.tenantId,
      status: { in: [...OPEN_ORDER_STATUSES] },
      OR: [
        {
          tipoEntrega: { not: 'ENCOMENDA' },
          criadoEm: { lt: referenceEndExclusive },
        },
        {
          tipoEntrega: 'ENCOMENDA',
          encomendaPara: { lt: agendaEndExclusive },
        },
      ],
    },
    include: { itens: true },
    orderBy: [
      { encomendaPara: 'asc' },
      { criadoEm: 'asc' },
    ],
  })

  const pendentesPixMercadoPago = orders
    .filter((pedido) => shouldSyncPendingMercadoPagoPix(pedido))
    .slice(0, 6)

  if (pendentesPixMercadoPago.length > 0) {
    await Promise.allSettled(
      pendentesPixMercadoPago.map((pedido) =>
        syncMercadoPagoPaymentById({
          paymentId: pedido.asaasPaymentId!,
          notificationId: buildMercadoPagoPollNotificationId(pedido.asaasPaymentId!),
          origin: 'POLL',
        }),
      ),
    )

    orders = await prisma.pedido.findMany({
      where: {
        tenantId: admin.tenantId,
        status: { in: [...OPEN_ORDER_STATUSES] },
        OR: [
          {
            tipoEntrega: { not: 'ENCOMENDA' },
            criadoEm: { lt: referenceEndExclusive },
          },
          {
            tipoEntrega: 'ENCOMENDA',
            encomendaPara: { lt: agendaEndExclusive },
          },
        ],
      },
      include: { itens: true },
      orderBy: [
        { encomendaPara: 'asc' },
        { criadoEm: 'asc' },
      ],
    })
  }

  return NextResponse.json({
    referenceDate: date,
    windowDays,
    orders,
  })
}
