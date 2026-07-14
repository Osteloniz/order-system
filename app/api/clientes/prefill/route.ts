import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPhoneLookupCandidates, isValidPhone, normalizePhone } from '@/lib/phone'
import { rateLimitPublicPrefill } from '@/lib/rateLimit'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

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
      return NextResponse.json({ found: false })
    }

    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ found: false })
    }

    const prefillRate = rateLimitPublicPrefill(getIp(request), tenant.id)
    if (!prefillRate.allowed) {
      return NextResponse.json({ found: false }, { status: 429 })
    }

    const cliente = await prisma.cliente.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [
          { telefone: { in: telefoneCandidates } },
          { whatsapp: { in: telefoneCandidates } },
        ],
      },
      select: {
        nome: true,
        clienteBloco: true,
        clienteApartamento: true,
      },
    })

    if (!cliente) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      cliente: {
        nome: cliente.nome,
        clienteBloco: cliente.clienteBloco,
        clienteApartamento: cliente.clienteApartamento,
      },
    })
  } catch (error) {
    console.error('[api/clientes/prefill] Erro:', error)
    return NextResponse.json({ found: false }, { status: 500 })
  }
}
