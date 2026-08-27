import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { buildClienteFidelidade, buildClienteResumoConsumo, ordenarClientesPorFidelidade } from '@/lib/clientes-summary'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const requestedTake = Number(request.nextUrl.searchParams.get('take') || 6)
    const take = Number.isFinite(requestedTake) ? Math.min(Math.max(requestedTake, 1), 20) : 6
    const clientes = await prisma.cliente.findMany({
      where: {
        tenantId: admin.tenantId,
        fidelidadeAtiva: true,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        fidelidadeAtiva: true,
        mimosEntregues: true,
        pedidos: {
          select: {
            itens: {
              select: {
                nomeProdutoSnapshot: true,
                quantidade: true,
              },
            },
          },
        },
      },
    })

    const fidelidade = clientes.map((cliente) => {
      const consumo = buildClienteResumoConsumo(cliente.pedidos)
      return {
        id: cliente.id,
        nome: cliente.nome,
        telefone: cliente.telefone,
        fidelidadeAtiva: cliente.fidelidadeAtiva,
        totalCookies: consumo.totalCookies,
        ...buildClienteFidelidade(consumo.totalCookies, cliente.mimosEntregues),
      }
    })

    return NextResponse.json(ordenarClientesPorFidelidade(fidelidade).slice(0, take))
  } catch (error) {
    return handleApiError('api/admin/clientes/fidelidade GET', error, 'Erro ao carregar fidelidade')
  }
}
