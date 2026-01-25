import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import type { StatusPedido } from '@/lib/types'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'ENTREGUE', 'CANCELADO']

// PATCH /api/admin/pedidos/:id/status - Atualiza status do pedido
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { status, motivoCancelamento } = body as {
      status: StatusPedido
      motivoCancelamento?: string
    }

    if (!statusValidos.includes(status)) {
      return NextResponse.json(
        { error: 'Status invalido' },
        { status: 400 }
      )
    }

    const pedidoAtual = await prisma.pedido.findUnique({ where: { id } })
    if (!pedidoAtual) {
      return NextResponse.json(
        { error: 'Pedido nao encontrado' },
        { status: 404 }
      )
    }

    // Bloqueia alteracoes para pedidos ja entregues ou cancelados.
    if (pedidoAtual.status === 'ENTREGUE') {
      return NextResponse.json(
        { error: 'Pedido entregue nao pode ser alterado' },
        { status: 400 }
      )
    }
    if (pedidoAtual.status === 'CANCELADO') {
      return NextResponse.json(
        { error: 'Pedido cancelado nao pode ser alterado' },
        { status: 400 }
      )
    }

    if (status === 'CANCELADO') {
      const motivoValido = typeof motivoCancelamento === 'string' && motivoCancelamento.trim().length > 0
      if (!motivoValido) {
        return NextResponse.json(
          { error: 'Motivo do cancelamento e obrigatorio' },
          { status: 400 }
        )
      }

      const pedidoCancelado = await prisma.pedido.update({
        where: { id },
        data: {
          status,
          motivoCancelamento: motivoCancelamento.trim()
        },
        include: { itens: true }
      })

      console.log(`[v0] Pedido ${id} atualizado para status: ${status}`)
      return NextResponse.json(pedidoCancelado)
    }

    const pedidoAtualizado = await prisma.pedido.update({
      where: { id },
      data: { status },
      include: { itens: true }
    })

    console.log(`[v0] Pedido ${id} atualizado para status: ${status}`)

    return NextResponse.json(pedidoAtualizado)
  } catch (error) {
    console.error('[v0] Erro ao atualizar status:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}

