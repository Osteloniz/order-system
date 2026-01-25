import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// PUT /api/admin/cupons/:id - Atualiza cupom
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const cupom = await prisma.cupom.findUnique({ where: { id } })
    if (!cupom) {
      return NextResponse.json({ error: 'Cupom nao encontrado' }, { status: 404 })
    }

    const codigo = body.codigo ? String(body.codigo).trim().toUpperCase() : cupom.codigo
    const tipo = body.tipo ?? cupom.tipo
    const valor = body.valor !== undefined ? Number(body.valor) : cupom.valor
    const maxUsos = body.maxUsos !== undefined ? Number(body.maxUsos) : cupom.maxUsos
    const expiraEm = body.expiraEm ? new Date(body.expiraEm) : cupom.expiraEm
    const ativo = body.ativo !== undefined ? Boolean(body.ativo) : cupom.ativo

    if (!codigo || (tipo !== 'FIXO' && tipo !== 'PERCENTUAL')) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'Valor invalido' }, { status: 400 })
    }
    if (!Number.isFinite(maxUsos) || maxUsos <= 0) {
      return NextResponse.json({ error: 'Limite de usos invalido' }, { status: 400 })
    }
    if (maxUsos < cupom.usos) {
      return NextResponse.json({ error: 'Limite de usos menor que usos atuais' }, { status: 400 })
    }
    if (Number.isNaN(expiraEm.getTime())) {
      return NextResponse.json({ error: 'Data de expiracao invalida' }, { status: 400 })
    }
    if (tipo === 'PERCENTUAL' && valor > 100) {
      return NextResponse.json({ error: 'Percentual nao pode ser maior que 100' }, { status: 400 })
    }

    const cupomAtualizado = await prisma.cupom.update({
      where: { id },
      data: {
        codigo,
        tipo,
        valor: Math.round(valor),
        maxUsos,
        expiraEm,
        ativo
      }
    })

    return NextResponse.json(cupomAtualizado)
  } catch (error) {
    console.error('[v0] Erro ao atualizar cupom:', error)
    return NextResponse.json({ error: 'Erro ao atualizar cupom' }, { status: 500 })
  }
}

// DELETE /api/admin/cupons/:id - Remove cupom (somente se usos = 0)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const cupom = await prisma.cupom.findUnique({ where: { id } })

  if (!cupom) {
    return NextResponse.json({ error: 'Cupom nao encontrado' }, { status: 404 })
  }
  if (cupom.usos > 0) {
    return NextResponse.json({ error: 'Cupom com usos nao pode ser excluido' }, { status: 400 })
  }

  await prisma.cupom.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
