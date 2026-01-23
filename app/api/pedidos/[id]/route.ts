import { NextRequest, NextResponse } from 'next/server'
import { pedidos } from '@/lib/mock-db'

// GET /api/pedidos/:id - Detalhe do pedido
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pedido = pedidos.find(p => p.id === id)

  if (!pedido) {
    return NextResponse.json(
      { error: 'Pedido não encontrado' },
      { status: 404 }
    )
  }

  return NextResponse.json(pedido)
}
