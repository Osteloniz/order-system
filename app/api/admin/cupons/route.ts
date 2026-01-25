import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/cupons - Lista cupons
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const cupons = await prisma.cupom.findMany({
    orderBy: { criadoEm: 'desc' }
  })
  return NextResponse.json(cupons)
}

// POST /api/admin/cupons - Cria cupom
export async function POST(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const codigo = String(body.codigo || '').trim().toUpperCase()
    const tipo = body.tipo
    const valor = Number(body.valor)
    const maxUsos = Number(body.maxUsos)
    const expiraEm = new Date(body.expiraEm)

    if (!codigo || (tipo !== 'FIXO' && tipo !== 'PERCENTUAL')) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'Valor invalido' }, { status: 400 })
    }
    if (!Number.isFinite(maxUsos) || maxUsos <= 0) {
      return NextResponse.json({ error: 'Limite de usos invalido' }, { status: 400 })
    }
    if (Number.isNaN(expiraEm.getTime())) {
      return NextResponse.json({ error: 'Data de expiracao invalida' }, { status: 400 })
    }

    if (tipo === 'PERCENTUAL' && valor > 100) {
      return NextResponse.json({ error: 'Percentual nao pode ser maior que 100' }, { status: 400 })
    }

    const novoCupom = await prisma.cupom.create({
      data: {
        codigo,
        tipo,
        valor: Math.round(valor),
        maxUsos,
        expiraEm,
        ativo: true
      }
    })

    return NextResponse.json(novoCupom, { status: 201 })
  } catch (error) {
    console.error('[v0] Erro ao criar cupom:', error)
    return NextResponse.json({ error: 'Erro ao criar cupom' }, { status: 500 })
  }
}

