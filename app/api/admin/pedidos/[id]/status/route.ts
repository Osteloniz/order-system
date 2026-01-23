import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { pedidos } from '@/lib/mock-db'
import type { StatusPedido } from '@/lib/types'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

const statusValidos: StatusPedido[] = ['FEITO', 'ACEITO', 'PREPARACAO', 'ENTREGUE']

// PATCH /api/admin/pedidos/:id/status - Atualiza status do pedido
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body as { status: StatusPedido }

    if (!statusValidos.includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido' },
        { status: 400 }
      )
    }

    const pedidoIndex = pedidos.findIndex(p => p.id === id)
    if (pedidoIndex === -1) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    pedidos[pedidoIndex].status = status
    
    console.log(`[v0] Pedido ${id} atualizado para status: ${status}`)

    return NextResponse.json(pedidos[pedidoIndex])
  } catch (error) {
    console.error('[v0] Erro ao atualizar status:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
