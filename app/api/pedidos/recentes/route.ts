import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPhoneLookupCandidates, isValidPhone, normalizePhone } from '@/lib/phone'
import { clearPublicCustomerAccessCookie, setPublicCustomerAccessCookie } from '@/lib/public-customer-access'
import { rateLimitPublicOrderLookup } from '@/lib/rateLimit'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

const MAX_PUBLIC_RECENT_ORDERS = 5

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const telefone = normalizePhone(body?.telefone)
    const telefoneCandidates = getPhoneLookupCandidates(body?.telefone)

    if (!telefone || !isValidPhone(telefone)) {
      return NextResponse.json({ error: 'Informe um telefone valido.' }, { status: 400 })
    }

    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }

    const lookupRate = rateLimitPublicOrderLookup(getIp(request), tenant.id, telefone)
    if (!lookupRate.allowed) {
      return NextResponse.json(
        { error: 'Muitas consultas seguidas. Aguarde um pouco antes de tentar novamente.' },
        { status: 429 },
      )
    }

    const clientes = await prisma.cliente.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { telefone: { in: telefoneCandidates } },
          { whatsapp: { in: telefoneCandidates } },
        ],
      },
      select: { id: true },
      take: MAX_PUBLIC_RECENT_ORDERS,
    })

    const clienteIds = clientes.map((cliente) => cliente.id)
    const orFilters = [
      { clienteTelefone: { in: telefoneCandidates } },
      { clienteWhatsapp: { in: telefoneCandidates } },
      ...(clienteIds.length > 0 ? [{ clienteId: { in: clienteIds } }] : []),
    ]

    const pedidos = await prisma.pedido.findMany({
      where: {
        tenantId: tenant.id,
        OR: orFilters,
      },
      orderBy: [
        { criadoEm: 'desc' },
        { id: 'desc' },
      ],
      take: MAX_PUBLIC_RECENT_ORDERS,
      select: {
        id: true,
        status: true,
        statusPagamento: true,
        pagamento: true,
        tipoCartao: true,
        tipoEntrega: true,
        encomendaPara: true,
        total: true,
        criadoEm: true,
        clienteNome: true,
      },
    })

    const response = NextResponse.json({ orders: pedidos })
    setPublicCustomerAccessCookie(response, tenant.id, telefone)
    return response
  } catch (error) {
    console.error('[api/pedidos/recentes] Erro:', error)
    return NextResponse.json({ error: 'Erro ao carregar pedidos recentes.' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  clearPublicCustomerAccessCookie(response)
  return response
}
