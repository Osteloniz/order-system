import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { buildClienteFidelidade, ordenarClientesPorFidelidade } from '@/lib/clientes-summary'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [clientes, pedidos] = await Promise.all([
      prisma.cliente.findMany({
        where: { tenantId: admin.tenantId },
        select: {
          id: true,
          nome: true,
          telefone: true,
          whatsapp: true,
          mimosEntregues: true,
        },
      }),
      prisma.pedido.findMany({
        where: {
          tenantId: admin.tenantId,
          clienteId: { not: null },
        },
        select: {
          clienteId: true,
          criadoEm: true,
          itens: {
            select: { quantidade: true },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
    ])

    const consumoPorCliente = new Map<string, { totalCookies: number; ultimoPedidoEm: Date | null }>()

    for (const pedido of pedidos) {
      if (!pedido.clienteId) continue
      const atual = consumoPorCliente.get(pedido.clienteId) ?? { totalCookies: 0, ultimoPedidoEm: null }
      atual.totalCookies += pedido.itens.reduce((total, item) => total + item.quantidade, 0)
      atual.ultimoPedidoEm ??= pedido.criadoEm
      consumoPorCliente.set(pedido.clienteId, atual)
    }

    const fidelidade = ordenarClientesPorFidelidade(clientes.map((cliente) => {
      const consumo = consumoPorCliente.get(cliente.id) ?? { totalCookies: 0, ultimoPedidoEm: null }
      return {
        ...cliente,
        totalCookies: consumo.totalCookies,
        ultimoPedidoEm: consumo.ultimoPedidoEm,
        resumoFidelidade: buildClienteFidelidade(consumo.totalCookies, cliente.mimosEntregues ?? 0),
      }
    }))

    return NextResponse.json({
      resumo: {
        clientesAcompanhados: fidelidade.length,
        clientesComMimo: fidelidade.filter((cliente) => cliente.resumoFidelidade.mimosDisponiveis > 0).length,
        mimosDisponiveis: fidelidade.reduce((total, cliente) => total + cliente.resumoFidelidade.mimosDisponiveis, 0),
      },
      clientes: fidelidade.slice(0, 8),
    })
  } catch (error) {
    return handleApiError('api/admin/clientes/fidelidade GET', error, 'Erro ao carregar fidelidade')
  }
}
