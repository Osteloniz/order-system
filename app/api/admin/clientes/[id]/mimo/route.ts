import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { buildClienteFidelidade, buildClienteResumoConsumo } from '@/lib/clientes-summary'
import { prisma } from '@/lib/db'
import { isProdutoMimoNome, MIMO_LOG_ORIGEM, MIMO_PRODUTO_NOME_PADRAO } from '@/lib/mimos'
import { consumeAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

function serializeClienteDetalhe(cliente: {
  id: string
  tenantId: string
  nome: string
  telefone: string | null
  whatsapp: string | null
  clienteBloco: string | null
  clienteApartamento: string | null
  observacoes: string | null
  mimosEntregues: number
  criadoEm: Date
  atualizadoEm: Date
  pedidos: {
    id: string
    criadoEm: Date
    status: string
    total: number
    itens: {
      id: string
      nomeProdutoSnapshot: string
      quantidade: number
      totalItem: number
    }[]
  }[]
}) {
  const resumoConsumo = buildClienteResumoConsumo(cliente.pedidos ?? [])

  return {
    ...cliente,
    totalPedidos: cliente.pedidos?.length ?? 0,
    ultimoPedidoEm: cliente.pedidos?.[0]?.criadoEm ?? null,
    resumoConsumo,
    resumoFidelidade: buildClienteFidelidade(resumoConsumo.totalCookies, cliente.mimosEntregues ?? 0),
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<unknown> }) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const { id } = (await params) as { id: string }

    const cliente = await prisma.$transaction(async (tx) => {
      const atual = await tx.cliente.findFirst({
        where: { id, tenantId: admin.tenantId },
        include: {
          pedidos: {
            include: { itens: true },
            orderBy: { criadoEm: 'desc' },
          },
        },
      })

      if (!atual) {
        return null
      }

      const resumoConsumo = buildClienteResumoConsumo(atual.pedidos ?? [])
      const fidelidade = buildClienteFidelidade(resumoConsumo.totalCookies, atual.mimosEntregues ?? 0)

      if (fidelidade.mimosDisponiveis <= 0) {
        throw new Error('Nenhum mimo disponivel para este cliente.')
      }

      const produtos = await tx.produto.findMany({
        where: {
          tenantId: admin.tenantId,
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
          preco: true,
        },
      })

      const produtoMimo = produtos.find((produto) => isProdutoMimoNome(produto.nome))

      if (!produtoMimo) {
        throw new Error(`Produto do mimo nao encontrado. Cadastre um produto ativo com nome "${MIMO_PRODUTO_NOME_PADRAO}".`)
      }

      await consumeAvailableStock(tx, admin.tenantId, produtoMimo.id, 1, produtoMimo.nome, {
        tipo: 'AJUSTE_ESTOQUE',
        descricao: `Baixa de estoque do mimo fidelidade entregue para ${atual.nome}.`,
        actorNome: admin.adminNome?.toString().trim() || null,
        nomeProduto: produtoMimo.nome,
        metadata: {
          origem: MIMO_LOG_ORIGEM,
          clienteId: atual.id,
          clienteNome: atual.nome,
          produtoMimoId: produtoMimo.id,
          produtoMimoNome: produtoMimo.nome,
          valorReferencial: produtoMimo.preco,
          quantidadeMimo: 1,
        },
      })

      return tx.cliente.update({
        where: { id: atual.id },
        data: {
          mimosEntregues: {
            increment: 1,
          },
        },
        include: {
          pedidos: {
            include: { itens: true },
            orderBy: { criadoEm: 'desc' },
            take: 20,
          },
        },
      })
    })

    if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })

    return NextResponse.json(serializeClienteDetalhe(cliente))
  } catch (error) {
    if (error instanceof Error && error.message === 'Nenhum mimo disponivel para este cliente.') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Produto do mimo nao encontrado')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Estoque insuficiente')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return handleApiError('api/admin/clientes/[id]/mimo POST', error, 'Erro ao registrar mimo entregue')
  }
}
