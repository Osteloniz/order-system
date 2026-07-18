import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error'
import { prisma } from '@/lib/db'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import {
  getPublicOrderAccessToken,
  isValidPublicOrderAccessToken,
  setPublicOrderAccessCookie,
} from '@/lib/public-order-access'
import { getTenantFromCookie } from '@/lib/tenant'
import { releaseReservedToAvailableStock } from '@/lib/stock'

export const runtime = 'nodejs'

const publicPedidoSelect = {
  id: true,
  clienteId: true,
  status: true,
  statusPagamento: true,
  asaasCheckoutId: true,
  asaasCheckoutUrl: true,
  asaasCheckoutExpiresAt: true,
  asaasPaymentId: true,
  asaasInvoiceUrl: true,
  asaasPixQrCode: true,
  asaasPixCopyPaste: true,
  asaasPaymentStatus: true,
  asaasLastEventId: true,
  asaasLastSyncAt: true,
  clienteNome: true,
  clienteTelefone: true,
  clienteWhatsapp: true,
  clienteBloco: true,
  clienteApartamento: true,
  observacoesPedido: true,
  pagamento: true,
  tipoCartao: true,
  tipoEntrega: true,
  encomendaPara: true,
  enderecoRetirada: true,
  frete: true,
  subtotal: true,
  total: true,
  criadoEm: true,
  motivoCancelamento: true,
  distanciaKm: true,
  descontoValor: true,
  cupomCodigoSnapshot: true,
  publicAccessTokenHash: true,
  itens: true,
} as const

type PublicPedido = Prisma.PedidoGetPayload<{ select: typeof publicPedidoSelect }>

function serializePublicPedido(
  pedido: PublicPedido | null,
  publicAccessToken?: string | null
) {
  if (!pedido) return null

  return {
    id: pedido.id,
    clienteId: pedido.clienteId,
    status: pedido.status,
    statusPagamento: pedido.statusPagamento,
    asaasCheckoutId: pedido.asaasCheckoutId,
    asaasCheckoutUrl: pedido.asaasCheckoutUrl,
    asaasCheckoutExpiresAt: pedido.asaasCheckoutExpiresAt,
    asaasPaymentId: pedido.asaasPaymentId,
    asaasInvoiceUrl: pedido.asaasInvoiceUrl,
    asaasPixQrCode: pedido.asaasPixQrCode,
    asaasPixCopyPaste: pedido.asaasPixCopyPaste,
    asaasPaymentStatus: pedido.asaasPaymentStatus,
    asaasLastEventId: pedido.asaasLastEventId,
    asaasLastSyncAt: pedido.asaasLastSyncAt,
    clienteNome: pedido.clienteNome,
    clienteTelefone: pedido.clienteTelefone,
    clienteWhatsapp: pedido.clienteWhatsapp,
    clienteBloco: pedido.clienteBloco,
    clienteApartamento: pedido.clienteApartamento,
    observacoesPedido: pedido.observacoesPedido,
    pagamento: pedido.pagamento,
    tipoCartao: pedido.tipoCartao,
    tipoEntrega: pedido.tipoEntrega,
    encomendaPara: pedido.encomendaPara,
    enderecoRetirada: pedido.enderecoRetirada,
    frete: pedido.frete,
    subtotal: pedido.subtotal,
    total: pedido.total,
    criadoEm: pedido.criadoEm,
    motivoCancelamento: pedido.motivoCancelamento,
    distanciaKm: pedido.distanciaKm,
    descontoValor: pedido.descontoValor,
    cupomCodigoSnapshot: pedido.cupomCodigoSnapshot,
    itens: pedido.itens,
    publicAccessToken: publicAccessToken ?? null,
    pagamentoOnline: pedido.pagamento === 'DINHEIRO'
      ? null
      : {
          gateway: 'ASAAS' as const,
          checkoutUrl: pedido.asaasCheckoutUrl,
          invoiceUrl: pedido.asaasInvoiceUrl,
          pixQrCode: pedido.asaasPixQrCode,
          pixCopyPaste: pedido.asaasPixCopyPaste,
          expiresAt: pedido.asaasCheckoutExpiresAt,
        },
  }
}

// GET /api/pedidos/:id - Detalhe do pedido
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }

    const accessToken = getPublicOrderAccessToken(request, id)
    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId: tenant.id },
      select: publicPedidoSelect,
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (!pedido.publicAccessTokenHash || !isValidPublicOrderAccessToken(accessToken, pedido.publicAccessTokenHash)) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    const response = NextResponse.json(serializePublicPedido(pedido))
    setPublicOrderAccessCookie(response, pedido.id, accessToken)
    return response
  } catch (error) {
    return handleApiError('api/pedidos/[id] GET', error, 'Erro ao carregar pedido')
  }
}

// PATCH /api/pedidos/:id - Permite ao cliente cancelar enquanto nao foi aceito nem pago.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }

    const accessToken = getPublicOrderAccessToken(request, id)
    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        itens: {
          select: {
            id: true,
            produtoId: true,
            quantidadePreparada: true,
          },
        },
      },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (!pedido.publicAccessTokenHash || !isValidPublicOrderAccessToken(accessToken, pedido.publicAccessTokenHash)) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    if (pedido.status !== 'FEITO') {
      return NextResponse.json(
        { error: 'Pedido ja aceito. Entre em contato com a loja para cancelar.' },
        { status: 400 }
      )
    }

    if (pedido.statusPagamento === 'APROVADO') {
      return NextResponse.json(
        { error: 'Pedido pago nao pode ser cancelado pelo cliente.' },
        { status: 400 }
      )
    }

    if (pedido.pagamento !== 'DINHEIRO' && pedido.asaasCheckoutId) {
      return NextResponse.json(
        { error: 'Pedidos com pagamento online devem ser cancelados pela loja para evitar inconsistencias no gateway.' },
        { status: 400 },
      )
    }

    const pedidoAtualizado = await prisma.$transaction(async (tx) => {
      if (pedido.tipoEntrega === 'ENCOMENDA') {
        for (const item of pedido.itens) {
          if (item.quantidadePreparada > 0) {
            await releaseReservedToAvailableStock(tx, tenant.id, item.produtoId, item.quantidadePreparada, {
              tipo: 'LIBERACAO_RESERVA',
              descricao: `Liberacao da reserva pelo cancelamento do cliente no pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id}.`,
              actorNome: 'Cliente',
              pedidoId: pedido.id,
              pedidoNumero: numeroPedidoCurto(pedido.id),
            })
          }

          await tx.itemPedido.update({
            where: { id: item.id },
            data: {
              quantidadePreparada: 0,
              preparadoEm: null,
            },
          })
        }
      }

      const atualizado = await tx.pedido.update({
        where: { id },
        data: {
          status: 'CANCELADO',
          motivoCancelamento: 'Cancelado pelo cliente antes do aceite/pagamento',
        },
        include: { itens: true },
      })

      await registrarLogOperacao(tx, {
        tenantId: tenant.id,
        tipo: 'PEDIDO_STATUS_ALTERADO',
        descricao: `Pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} cancelado pelo cliente.`,
        actorNome: 'Cliente',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id),
        metadata: {
          statusAnterior: pedido.status,
          statusNovo: 'CANCELADO',
        },
      })

      return atualizado
    })

    return NextResponse.json(serializePublicPedido(pedidoAtualizado))
  } catch (error) {
    return handleApiError('api/pedidos/[id] PATCH', error, 'Erro ao cancelar pedido')
  }
}
