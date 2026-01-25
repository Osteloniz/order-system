import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/cupons/validar?codigo=...&subtotal=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const codigo = searchParams.get('codigo')?.trim().toUpperCase()
  const subtotalParam = searchParams.get('subtotal')

  if (!codigo) {
    return NextResponse.json({ error: 'Codigo do cupom nao informado' }, { status: 400 })
  }

  const subtotal = Number(subtotalParam)
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return NextResponse.json({ error: 'Subtotal invalido' }, { status: 400 })
  }

  const cupom = await prisma.cupom.findUnique({ where: { codigo } })
  const agora = new Date()

  if (!cupom || !cupom.ativo) {
    return NextResponse.json({ error: 'Cupom invalido' }, { status: 400 })
  }
  if (cupom.expiraEm <= agora) {
    return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 })
  }
  if (cupom.usos >= cupom.maxUsos) {
    return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 })
  }

  let descontoValor = 0
  if (cupom.tipo === 'PERCENTUAL') {
    descontoValor = Math.round(subtotal * (cupom.valor / 100))
  } else {
    descontoValor = cupom.valor
  }
  descontoValor = Math.min(descontoValor, subtotal)

  return NextResponse.json({
    descontoValor,
    codigo: cupom.codigo
  })
}

