import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// PUT /api/admin/cupons/:id - Atualiza cupom
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const cupom = await prisma.cupom.findFirst({ where: { id, tenantId: admin.tenantId } })
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

    if (codigo !== cupom.codigo) {
      const existing = await prisma.cupom.findFirst({
        where: { codigo, tenantId: admin.tenantId, NOT: { id } }
      })
      if (existing) {
        return NextResponse.json({ error: 'Codigo de cupom ja existe' }, { status: 400 })
      }
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
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const cupom = await prisma.cupom.findFirst({ where: { id, tenantId: admin.tenantId } })

  if (!cupom) {
    return NextResponse.json({ error: 'Cupom nao encontrado' }, { status: 404 })
  }
  if (cupom.usos > 0) {
    return NextResponse.json({ error: 'Cupom com usos nao pode ser excluido' }, { status: 400 })
  }

  await prisma.cupom.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
