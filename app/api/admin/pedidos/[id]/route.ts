import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { z } from 'zod'
import { atualizarPedidoAdmin } from '@/lib/admin-pedidos'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { addAvailableStock, releaseReservedToAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

const separacaoPessoaSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    nomeProduto: z.string().trim().min(1).max(120),
    quantidade: z.number().int().min(1).max(99),
  })).min(1).max(50),
})

const pedidoAdminSchema = z.object({
  clienteId: z.string().uuid().optional(),
  clienteNome: z.string().trim().min(2).max(80),
  clienteTelefone: z.string().trim().max(20).optional(),
  clienteWhatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  clienteObservacoes: z.string().trim().max(1000).optional(),
  observacoesPedido: z.string().trim().max(1000).optional(),
  responsavelPedido: z.string().trim().max(120).optional(),
  destinatariosPedido: z.string().trim().max(1000).optional(),
  separacaoResponsavel: z.array(separacaoPessoaSchema).max(50).optional(),
  levadoEm: z.string().trim().optional(),
  pagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']),
  tipoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA', 'ENCOMENDA']),
  encomendaPara: z.string().trim().optional(),
  statusPagamento: z.enum(['NAO_APLICAVEL', 'PENDENTE', 'APROVADO']).optional(),
  cupomCodigo: z.string().trim().max(40).optional(),
  valorPromocional: z.number().int().min(0).max(1_000_000).optional(),
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(99)
  })).min(1).max(50)
}).strict().superRefine((data, ctx) => {
  if (data.tipoEntrega === 'RESERVA_PAULISTANO') {
    if (!data.clienteBloco?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteBloco'], message: 'Bloco obrigatorio' })
    }
    if (!data.clienteApartamento?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteApartamento'], message: 'Apartamento obrigatorio' })
    }
  }

  if (data.tipoEntrega === 'ENCOMENDA') {
    const parsedDate = data.encomendaPara ? new Date(data.encomendaPara) : null
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['encomendaPara'], message: 'Data e hora da encomenda obrigatorias' })
    }
  }
  if (data.cupomCodigo?.trim() && (data.valorPromocional ?? 0) > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valorPromocional'], message: 'Use cupom ou valor promocional' })
  }
  const temResponsavel = Boolean(data.responsavelPedido?.trim())
  if (!temResponsavel) {
    if (data.separacaoResponsavel?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['responsavelPedido'], message: 'Informe o responsavel para usar etiquetas' })
    }
    if (data.levadoEm?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['responsavelPedido'], message: 'Data e hora de levado exigem um responsavel' })
    }
  }
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const parsed = pedidoAdminSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const telefone = normalizePhone(parsed.data.clienteTelefone)
    const whatsapp = normalizePhone(parsed.data.clienteWhatsapp)
    if (telefone && !isValidPhone(telefone)) {
      return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
    }
    if (whatsapp && !isValidPhone(whatsapp)) {
      return NextResponse.json({ error: 'WhatsApp invalido' }, { status: 400 })
    }

    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId: admin.tenantId },
      include: { itens: true },
    })
    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }
    if (pedido.tipoEntrega !== parsed.data.tipoEntrega) {
      return NextResponse.json({ error: 'A edicao nao permite alterar o tipo de entrega deste pedido' }, { status: 400 })
    }

    const pedidoAtualizado = await prisma.$transaction(async (tx) => {
      const configuracao = await tx.configuracao.findFirst({
        where: { tenantId: admin.tenantId },
        select: { enderecoRetirada: true },
      })

      return atualizarPedidoAdmin(
        tx,
        admin.tenantId,
        pedido,
        parsed.data,
        configuracao,
        admin.session.user?.name?.toString().trim() || null
      )
    })

    return NextResponse.json(pedidoAtualizado)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao editar pedido' },
      { status: 400 }
    )
  }
}

// DELETE /api/admin/pedidos/:id - Remove pedido nao pago ou cancelado.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { id } = await params
  const pedido = await prisma.pedido.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: {
      itens: {
        select: {
          id: true,
          produtoId: true,
          quantidade: true,
          quantidadePreparada: true,
        },
      },
    },
  })

  if (!pedido) {
    return NextResponse.json(
      { error: 'Pedido nao encontrado' },
      { status: 404 }
    )
  }

  if (pedido.statusPagamento === 'APROVADO' && pedido.status !== 'CANCELADO') {
    return NextResponse.json(
      { error: 'Pedidos pagos so podem ser excluidos depois de cancelados' },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    if (
      pedido.tipoEntrega !== 'ENCOMENDA' &&
      pedido.estoqueBaixadoEm
    ) {
      for (const item of pedido.itens) {
        await addAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade, {
          tipo: 'ESTORNO_ESTOQUE',
          descricao: `Estorno ao excluir o pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id}.`,
          actorNome: admin.session.user?.name?.toString().trim() || null,
          pedidoId: pedido.id,
          pedidoNumero: numeroPedidoCurto(pedido.id),
        })
      }
    }

    if (
      pedido.tipoEntrega !== 'ENCOMENDA' &&
      !pedido.estoqueBaixadoEm &&
      pedido.estoqueReservadoEm
    ) {
      for (const item of pedido.itens) {
        await releaseReservedToAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidade, {
          tipo: 'LIBERACAO_RESERVA',
          descricao: `Liberacao da reserva operacional ao excluir o pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id}.`,
          actorNome: admin.session.user?.name?.toString().trim() || null,
          pedidoId: pedido.id,
          pedidoNumero: numeroPedidoCurto(pedido.id),
        })
      }
    }

    if (pedido.tipoEntrega === 'ENCOMENDA' && pedido.status !== 'ENTREGUE') {
      for (const item of pedido.itens) {
        if (item.quantidadePreparada > 0) {
          await releaseReservedToAvailableStock(tx, admin.tenantId, item.produtoId, item.quantidadePreparada, {
            tipo: 'LIBERACAO_RESERVA',
            descricao: `Liberacao da reserva ao excluir o pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id}.`,
            actorNome: admin.session.user?.name?.toString().trim() || null,
            pedidoId: pedido.id,
            pedidoNumero: numeroPedidoCurto(pedido.id),
          })
        }
      }
    }

    await registrarLogOperacao(tx, {
      tenantId: admin.tenantId,
      tipo: 'PEDIDO_EXCLUIDO',
      descricao: `Pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} excluido do painel.`,
      actorNome: admin.session.user?.name?.toString().trim() || null,
      pedidoId: pedido.id,
      pedidoNumero: numeroPedidoCurto(pedido.id),
      quantidade: pedido.itens.reduce((acc, item) => acc + item.quantidade, 0),
      metadata: {
        status: pedido.status,
        statusPagamento: pedido.statusPagamento,
      },
    })

    await tx.itemPedido.deleteMany({ where: { pedidoId: id } })
    await tx.pedido.delete({ where: { id } })
  })

  console.log(`[v0] Pedido ${id} excluido`)

  return NextResponse.json({ success: true })
}
