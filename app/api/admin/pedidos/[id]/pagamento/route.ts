import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { syncOrderStockForTransition } from '@/lib/order-stock'
import { resolveStatusAfterPaymentChange } from '@/lib/order-status'
import { ensureOrderHostedCheckout, switchOrderPaymentMethod } from '@/lib/order-payment'

export const runtime = 'nodejs'

const pagamentoSchema = z.object({
  statusPagamento: z.enum(['NAO_APLICAVEL', 'PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'REEMBOLSADO']),
}).strict()

const pagamentoActionSchema = z.object({
  action: z.enum(['REFRESH_LINK', 'SWITCH_METHOD']),
  pagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']).optional(),
  tipoCartao: z.enum(['CREDITO', 'DEBITO']).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.action === 'SWITCH_METHOD') {
    if (!data.pagamento) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pagamento'], message: 'Pagamento obrigatorio' })
    }
    if (data.pagamento === 'CARTAO' && !data.tipoCartao) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipoCartao'], message: 'Tipo do cartao obrigatorio' })
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

  const parsed = pagamentoSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  const { id } = await params
  const pedido = await prisma.pedido.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { itens: true },
  })

  if (!pedido) {
    return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
  }

  if (pedido.status === 'CANCELADO') {
    return NextResponse.json(
      { error: 'Pedido cancelado nao pode ter pagamento alterado' },
      { status: 400 }
    )
  }

  const actorNome = admin.session.user?.name?.toString().trim() || null
  const atualizado = await prisma.$transaction(async (tx) => {
    const pedidoAtualTransacao = await tx.pedido.findFirst({
      where: { id, tenantId: admin.tenantId },
      include: { itens: true },
    })

    if (!pedidoAtualTransacao) {
      throw new Error('Pedido nao encontrado')
    }

    const pedidoNumero = numeroPedidoCurto(pedidoAtualTransacao.id) ?? pedidoAtualTransacao.id
    const nextStatus = resolveStatusAfterPaymentChange(
      pedidoAtualTransacao.status,
      parsed.data.statusPagamento,
      pedidoAtualTransacao.tipoEntrega,
    )

    const estoqueControle = await syncOrderStockForTransition({
      tx,
      tenantId: admin.tenantId,
      pedidoAtual: pedidoAtualTransacao,
      targetStatus: nextStatus,
      targetStatusPagamento: parsed.data.statusPagamento,
      actorNome,
      pedidoNumero,
    })

    const updated = await tx.pedido.update({
      where: { id },
      data: {
        statusPagamento: parsed.data.statusPagamento,
        status: nextStatus,
        estoqueReservadoEm: estoqueControle.estoqueReservadoEm,
        estoqueBaixadoEm: estoqueControle.estoqueBaixadoEm,
      },
      include: { itens: true },
    })

    if (nextStatus !== pedidoAtualTransacao.status) {
      await registrarLogOperacao(tx, {
        tenantId: admin.tenantId,
        tipo: 'PEDIDO_STATUS_ALTERADO',
        descricao: `Status do pedido #${pedidoNumero} ajustado de ${pedidoAtualTransacao.status} para ${nextStatus} pelo status de pagamento.`,
        actorNome,
        pedidoId: pedidoAtualTransacao.id,
        pedidoNumero,
        metadata: {
          origem: 'PAGAMENTO_MANUAL',
          statusAnterior: pedidoAtualTransacao.status,
          statusNovo: nextStatus,
          statusPagamento: parsed.data.statusPagamento,
        },
      })
    }

    return updated
  })

  return NextResponse.json(atualizado)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await getAdminSession()
    if (!admin) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const parsed = pagamentoActionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const { id } = await params
    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId: admin.tenantId },
      include: { itens: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (parsed.data.action === 'REFRESH_LINK') {
      if (pedido.pagamento === 'DINHEIRO') {
        return NextResponse.json({ error: 'Esse pedido nao possui pagamento online.' }, { status: 400 })
      }

      const result = await prisma.$transaction((tx) => ensureOrderHostedCheckout(tx, pedido, {
        mercadoPagoPixMode: pedido.pagamento === 'PIX' ? 'DIRECT' : undefined,
      }))
      return NextResponse.json({
        pedido: result.pedido,
        reused: result.reused,
      })
    }

    const actorNome = admin.session.user?.name?.toString().trim() || null
    const pedidoNumero = numeroPedidoCurto(pedido.id) ?? pedido.id
    const atualizado = await prisma.$transaction(async (tx) => {
      const pedidoComPagamentoAtualizado = await switchOrderPaymentMethod(tx, pedido, {
        pagamento: parsed.data.pagamento ?? 'DINHEIRO',
        tipoCartao: parsed.data.tipoCartao ?? null,
      })

      const estoqueControle = await syncOrderStockForTransition({
        tx,
        tenantId: admin.tenantId,
        pedidoAtual: pedido,
        targetStatus: pedidoComPagamentoAtualizado.status,
        targetStatusPagamento: pedidoComPagamentoAtualizado.statusPagamento,
        targetPagamento: pedidoComPagamentoAtualizado.pagamento,
        actorNome,
        pedidoNumero,
      })

      return tx.pedido.update({
        where: { id: pedido.id },
        data: {
          estoqueReservadoEm: estoqueControle.estoqueReservadoEm,
          estoqueBaixadoEm: estoqueControle.estoqueBaixadoEm,
        },
        include: { itens: true },
      })
    })

    return NextResponse.json({ pedido: atualizado })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar o pagamento' },
      { status: 400 },
    )
  }
}
