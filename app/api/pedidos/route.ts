import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAsaasCheckout, hasActiveAsaasPixKey, isAsaasApiError, normalizeAsaasPhone } from '@/lib/asaas'
import { appLogger } from '@/lib/app-logger'
import { calcularSubtotal, calcularTotal, calcularTotalItem } from '@/lib/calc'
import { prisma } from '@/lib/db'
import {
  buildHostedReturnUrl,
  serializeHostedPagamentoOnline,
  type OnlinePaymentGateway,
} from '@/lib/hosted-payment'
import {
  createMercadoPagoPixPayment,
  createMercadoPagoPreference,
  getMercadoPagoLocalReuseExpiryDate,
  getMercadoPagoWebhookUrl,
  isMercadoPagoApiError,
} from '@/lib/mercado-pago'
import { lockProductStockRows, loadShadowCommittedQuantityMap, loadShadowCommittedQuantityMapTx } from '@/lib/order-stock'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { getOnlinePaymentGateway, resolvePublicCardAvailability } from '@/lib/payment-gateway'
import { getPhoneLookupCandidates, isValidPhone, normalizePhone } from '@/lib/phone'
import { resolveProductOrderMode } from '@/lib/product-availability'
import { rateLimitPublicCheckoutByIp, rateLimitPublicCheckoutByPhone } from '@/lib/rateLimit'
import {
  generateAsaasReturnToken,
  generatePublicOrderAccessToken,
  hashAsaasReturnToken,
  hashPublicOrderAccessToken,
  setPublicOrderAccessCookie,
} from '@/lib/public-order-access'
import { setPublicCustomerAccessCookie } from '@/lib/public-customer-access'
import {
  buildHostedCheckoutItemsFromOrder,
  buildHostedCheckoutLinesFromOrder,
  buildMercadoPagoHostedCheckoutItemsFromOrder,
} from '@/lib/order-payment'
import { getTenantFromCookie } from '@/lib/tenant'
import type { CriarPedidoPayload } from '@/lib/types'

export const runtime = 'nodejs'

function getProviderErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const candidate = (error as { status?: unknown }).status
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

class PublicOrderCheckoutError extends Error {
  status: number

  constructor(message: string, status = 409) {
    super(message)
    this.name = 'PublicOrderCheckoutError'
    this.status = status
  }
}

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
}

type ItemPedidoCreate = {
  produtoId: string
  nomeProdutoSnapshot: string
  precoUnitarioSnapshot: number
  quantidade: number
  totalItem: number
}

const pedidoSchema = z.object({
  clienteNome: z.string().trim().min(2).max(80),
  clienteTelefone: z.string().trim().min(8).max(20),
  clienteWhatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  pagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']),
  tipoCartao: z.enum(['CREDITO', 'DEBITO']).optional(),
  tipoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA', 'ENCOMENDA']),
  encomendaPara: z.string().trim().optional(),
  enderecoEntrega: z.string().trim().max(200).optional(),
  distanciaKm: z.number().finite().nonnegative().max(100).optional(),
  cupomCodigo: z.string().trim().max(40).optional(),
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(99),
  })).min(1).max(50),
}).strict().superRefine((data, ctx) => {
  if (data.tipoEntrega === 'RESERVA_PAULISTANO') {
    if (!data.clienteBloco?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteBloco'], message: 'Bloco obrigatorio' })
    }
    if (!data.clienteApartamento?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clienteApartamento'], message: 'Apartamento obrigatorio' })
    }
  }
})

function serializePublicPedido(
  pedido: {
    id: string
    clienteId: string | null
    status: 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'PRONTO_ENTREGA' | 'ENTREGUE' | 'CANCELADO'
    statusPagamento: 'NAO_APLICAVEL' | 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REEMBOLSADO'
    asaasCheckoutId: string | null
    asaasCheckoutUrl: string | null
    asaasCheckoutExpiresAt: Date | null
    asaasPaymentId: string | null
    asaasInvoiceUrl: string | null
    asaasPixQrCode: string | null
    asaasPixCopyPaste: string | null
    asaasPaymentStatus: string | null
    asaasLastEventId: string | null
    asaasLastSyncAt: Date | null
    clienteNome: string
    clienteTelefone: string | null
    clienteWhatsapp: string | null
    clienteBloco: string | null
    clienteApartamento: string | null
    observacoesPedido: string | null
    pagamento: 'PIX' | 'DINHEIRO' | 'CARTAO'
    tipoCartao: 'CREDITO' | 'DEBITO' | null
    tipoEntrega: 'ENTREGA' | 'RESERVA_PAULISTANO' | 'RETIRADA' | 'ENCOMENDA'
    encomendaPara: Date | null
    enderecoRetirada: string
    frete: number
    subtotal: number
    total: number
    criadoEm: Date
    motivoCancelamento: string | null
    distanciaKm: number | null
    descontoValor: number | null
    cupomCodigoSnapshot: string | null
    itens: Array<{
      id: string
      pedidoId: string
      produtoId: string
      nomeProdutoSnapshot: string
      precoUnitarioSnapshot: number
      quantidade: number
      totalItem: number
      quantidadePreparada: number
      preparadoEm: Date | null
    }>
  },
  publicAccessToken?: string | null,
) {
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
    pagamentoOnline: serializeHostedPagamentoOnline(pedido),
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = pedidoSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body: CriarPedidoPayload = parsed.data
    const telefoneLimpo = normalizePhone(body.clienteTelefone)
    const whatsappLimpo = body.clienteWhatsapp ? normalizePhone(body.clienteWhatsapp) : ''
    const telefoneCandidates = getPhoneLookupCandidates(body.clienteTelefone)
    const whatsappCandidates = getPhoneLookupCandidates(body.clienteWhatsapp)

    if (!isValidPhone(telefoneLimpo)) {
      return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
    }
    if (body.clienteWhatsapp && !isValidPhone(whatsappLimpo)) {
      return NextResponse.json({ error: 'WhatsApp invalido' }, { status: 400 })
    }

    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
    }
    if (!tenant.isOpen) {
      return NextResponse.json({ error: 'Estabelecimento fechado' }, { status: 403 })
    }

    const checkoutRateByIp = rateLimitPublicCheckoutByIp(getIp(request), tenant.id)
    if (!checkoutRateByIp.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas de pedido em pouco tempo. Aguarde alguns minutos antes de tentar novamente.' },
        { status: 429 },
      )
    }

    const checkoutRateByPhone = rateLimitPublicCheckoutByPhone(tenant.id, telefoneLimpo)
    if (!checkoutRateByPhone.allowed) {
      return NextResponse.json(
        { error: 'Esse numero atingiu o limite temporario de tentativas de checkout. Aguarde alguns minutos antes de tentar novamente.' },
        { status: 429 },
      )
    }

    const configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: tenant.id },
    })
    const frete = 0

    const entregaReservaDisponivel = configuracao?.checkoutPublicoEntregaReservaPaulistano ?? true
    const entregaRetiradaDisponivel = configuracao?.checkoutPublicoEntregaRetirada ?? true
    const entregaEncomendaDisponivel = configuracao?.checkoutPublicoEntregaEncomenda ?? true
    const cardAvailability = resolvePublicCardAvailability({
      cartaoHabilitado: configuracao?.checkoutPublicoPagamentoCartao ?? true,
      cartaoCreditoHabilitado: configuracao?.checkoutPublicoPagamentoCartaoCredito ?? true,
      cartaoDebitoHabilitado: configuracao?.checkoutPublicoPagamentoCartaoDebito ?? true,
    })
    const pixGatewayDisponivel =
      cardAvailability.gateway.gateway === 'ASAAS'
        ? await hasActiveAsaasPixKey()
        : true
    const pagamentoPixDisponivel = (configuracao?.checkoutPublicoPagamentoPix ?? true) && pixGatewayDisponivel
    const pagamentoDinheiroDisponivel = configuracao?.checkoutPublicoPagamentoDinheiro ?? true
    const pagamentoCartaoDisponivel = cardAvailability.cartao
    const cartaoCreditoDisponivel = cardAvailability.cartaoCredito
    const cartaoDebitoDisponivel = cardAvailability.cartaoDebito
    const onlineGateway = getOnlinePaymentGateway().gateway

    const itens: ItemPedidoCreate[] = []
    const itemIds = Array.from(new Set(body.itens.map((item) => item.produtoId)))
    const produtos = await prisma.produto.findMany({
      where: {
        id: { in: itemIds },
        descontinuado: false,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        nome: true,
        preco: true,
        ativo: true,
        disponivelParaEncomenda: true,
        estoqueProdutos: {
          where: { tenantId: tenant.id },
          select: { quantidadeDisponivel: true },
          take: 1,
        },
      },
    })
    const shadowCommittedMap = await loadShadowCommittedQuantityMap(tenant.id)
    const produtosMap = new Map(produtos.map((produto) => [produto.id, produto]))
    const itensSomenteEncomenda = new Set<string>()

    for (const item of body.itens) {
      const produto = produtosMap.get(item.produtoId)
      if (!produto) {
        return NextResponse.json(
          { error: `Produto nao encontrado ou indisponivel: ${item.produtoId}` },
          { status: 400 },
        )
      }

      const estoqueDisponivel = Math.max(
        0,
        (produto.estoqueProdutos[0]?.quantidadeDisponivel ?? 0) - (shadowCommittedMap.get(produto.id) ?? 0),
      )
      const statusDisponibilidade = resolveProductOrderMode({
        requestedQty: item.quantidade,
        ativoNoCatalogo: produto.ativo,
        estoqueDisponivel,
        disponivelParaEncomenda: produto.disponivelParaEncomenda,
        encomendaHabilitada: entregaEncomendaDisponivel,
      })

      if (statusDisponibilidade === 'INDISPONIVEL') {
        return NextResponse.json({ error: `${produto.nome} nao esta disponivel no momento.` }, { status: 400 })
      }

      if (statusDisponibilidade === 'SOMENTE_ENCOMENDA') {
        itensSomenteEncomenda.add(produto.nome)
      }

      itens.push({
        produtoId: produto.id,
        nomeProdutoSnapshot: produto.nome,
        precoUnitarioSnapshot: produto.preco,
        quantidade: item.quantidade,
        totalItem: calcularTotalItem(produto.preco, item.quantidade),
      })
    }

    if (itensSomenteEncomenda.size > 0 && body.tipoEntrega !== 'ENCOMENDA') {
      return NextResponse.json(
        {
          error: `Alguns itens do carrinho estao disponiveis apenas por encomenda: ${Array.from(itensSomenteEncomenda).join(', ')}.`,
        },
        { status: 400 },
      )
    }

    const subtotal = calcularSubtotal(itens)

    if (
      (body.tipoEntrega === 'RESERVA_PAULISTANO' && !entregaReservaDisponivel) ||
      (body.tipoEntrega === 'RETIRADA' && !entregaRetiradaDisponivel) ||
      (body.tipoEntrega === 'ENCOMENDA' && !entregaEncomendaDisponivel)
    ) {
      return NextResponse.json({ error: 'Esse tipo de entrega nao esta disponivel no momento' }, { status: 400 })
    }

    if (
      (body.pagamento === 'PIX' && !pagamentoPixDisponivel) ||
      (body.pagamento === 'DINHEIRO' && !pagamentoDinheiroDisponivel) ||
      (body.pagamento === 'CARTAO' && !pagamentoCartaoDisponivel)
    ) {
      return NextResponse.json({ error: 'Essa forma de pagamento nao esta disponivel no momento' }, { status: 400 })
    }

    let encomendaParaPedido: Date | null = null
    if (body.tipoEntrega === 'ENCOMENDA') {
      if ((configuracao?.checkoutPublicoEncomendaModo ?? 'CLIENTE_DEFINE') === 'FIXO') {
        if (!configuracao?.checkoutPublicoEncomendaDataFixa) {
          return NextResponse.json({ error: 'A loja ainda nao configurou a data fixa para encomenda' }, { status: 400 })
        }
        encomendaParaPedido = configuracao.checkoutPublicoEncomendaDataFixa
      } else {
        const parsedDate = body.encomendaPara ? new Date(body.encomendaPara) : null
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json({ error: 'Data e hora da encomenda obrigatorias' }, { status: 400 })
        }
        encomendaParaPedido = parsedDate
      }
    }

    let tipoCartaoPedido: 'CREDITO' | 'DEBITO' | null = null
    if (body.pagamento === 'CARTAO') {
      if (body.tipoCartao === 'CREDITO' && !cartaoCreditoDisponivel) {
        return NextResponse.json({ error: 'Cartao de credito indisponivel no momento' }, { status: 400 })
      }
      if (body.tipoCartao === 'DEBITO' && !cartaoDebitoDisponivel) {
        return NextResponse.json({ error: 'Cartao de debito indisponivel no momento' }, { status: 400 })
      }

      if (body.tipoCartao) {
        tipoCartaoPedido = body.tipoCartao
      } else if (cartaoCreditoDisponivel && !cartaoDebitoDisponivel) {
        tipoCartaoPedido = 'CREDITO'
      } else if (!cartaoCreditoDisponivel && cartaoDebitoDisponivel) {
        tipoCartaoPedido = 'DEBITO'
      } else {
        return NextResponse.json({ error: 'Tipo do cartao obrigatorio' }, { status: 400 })
      }
    }

    if ((body.pagamento === 'PIX' || body.pagamento === 'CARTAO') && !onlineGateway) {
      return NextResponse.json(
        { error: 'O pagamento online ainda nao foi configurado. Tente outra forma de pagamento ou avise a loja.' },
        { status: 503 },
      )
    }

    let cupomId: string | undefined
    let cupomCodigoSnapshot: string | undefined
    let descontoValor = 0

    if (body.cupomCodigo) {
      const codigo = body.cupomCodigo.trim().toUpperCase()
      const cupom = await prisma.cupom.findFirst({
        where: { codigo, tenantId: tenant.id },
      })

      const agora = new Date()
      if (!cupom || !cupom.ativo) {
        return NextResponse.json({ error: 'Cupom invalido' }, { status: 400 })
      }
      if (cupom.expiraEm <= agora) {
        return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 })
      }
      if (cupom.usos >= cupom.maxUsos) {
        return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 })
      }

      descontoValor = cupom.tipo === 'PERCENTUAL'
        ? Math.round(subtotal * (cupom.valor / 100))
        : cupom.valor
      descontoValor = Math.min(descontoValor, subtotal)
      cupomId = cupom.id
      cupomCodigoSnapshot = cupom.codigo
    }

    const total = calcularTotal(subtotal, frete) - descontoValor
    const existingCliente = await prisma.cliente.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [
          { telefone: { in: telefoneCandidates } },
          { whatsapp: { in: telefoneCandidates } },
          ...(whatsappCandidates.length > 0
            ? [
                { telefone: { in: whatsappCandidates } },
                { whatsapp: { in: whatsappCandidates } },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        whatsapp: true,
      },
    })

    const clienteNomePedido = existingCliente?.nome?.trim() || body.clienteNome.trim()
    const clienteWhatsappPedido = existingCliente?.whatsapp || whatsappLimpo || telefoneLimpo
    const publicAccessToken = generatePublicOrderAccessToken()
    const pedidoId = randomUUID()
    let hostedCheckoutGateway: OnlinePaymentGateway | null = null
    let hostedCheckoutReturnToken: string | null = null
    let hostedCheckout:
      | {
          id: string
          link: string | null
          expiresAt: Date
          status: string | null
          pixQrCode?: string | null
          pixCopyPaste?: string | null
        }
      | null = null

    if (body.pagamento === 'PIX' || body.pagamento === 'CARTAO') {
      hostedCheckoutGateway = onlineGateway
      const returnToken = generateAsaasReturnToken()
      hostedCheckoutReturnToken = returnToken
      const pedidoCheckout = {
        frete,
        subtotal,
        total: Math.max(0, total),
        descontoValor: descontoValor > 0 ? descontoValor : null,
        itens,
      }

      const checkoutLines = buildHostedCheckoutLinesFromOrder(pedidoCheckout)
      if (checkoutLines.length === 0) {
        return NextResponse.json(
          { error: 'Esse pedido nao possui valor valido para pagamento online. Ajuste o total ou escolha pagamento manual.' },
          { status: 400 },
        )
      }

      try {
        if (hostedCheckoutGateway === 'ASAAS') {
          const checkoutItems = buildHostedCheckoutItemsFromOrder(pedidoCheckout)
          const asaasCheckout = await createAsaasCheckout({
            externalReference: pedidoId,
            customerName: clienteNomePedido,
            customerPhone: normalizeAsaasPhone(clienteWhatsappPedido || telefoneLimpo),
            billingTypes: body.pagamento === 'PIX' ? ['PIX'] : ['CREDIT_CARD'],
            items: checkoutItems,
            successUrl: buildHostedReturnUrl(pedidoId, 'success', returnToken, hostedCheckoutGateway),
            cancelUrl: buildHostedReturnUrl(pedidoId, 'cancel', returnToken, hostedCheckoutGateway),
            expiredUrl: buildHostedReturnUrl(pedidoId, 'expired', returnToken, hostedCheckoutGateway),
          })

          const expiryMinutes = Number.isFinite(asaasCheckout.minutesToExpire) && asaasCheckout.minutesToExpire
            ? asaasCheckout.minutesToExpire
            : 60

          hostedCheckout = {
            id: asaasCheckout.id,
            link: asaasCheckout.link,
            expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
            status: asaasCheckout.status ?? null,
          }
        } else if (hostedCheckoutGateway === 'MERCADO_PAGO') {
          const externalReference = `${pedidoId}:${returnToken}`

          if (body.pagamento === 'PIX') {
            const mercadoPagoPix = await createMercadoPagoPixPayment({
              externalReference,
              amountCents: Math.max(0, total),
              description: `Pedido ${pedidoId.slice(-8).toUpperCase()}`,
              customerName: clienteNomePedido,
              notificationUrl: getMercadoPagoWebhookUrl(),
            })

            hostedCheckout = {
              id: mercadoPagoPix.id,
              link: mercadoPagoPix.link,
              expiresAt: getMercadoPagoLocalReuseExpiryDate(),
              status: mercadoPagoPix.statusDetail || mercadoPagoPix.status || 'pending',
              pixQrCode: mercadoPagoPix.qrCodeBase64,
              pixCopyPaste: mercadoPagoPix.qrCode,
            }
          } else {
            const checkoutItems = buildMercadoPagoHostedCheckoutItemsFromOrder(pedidoCheckout)
            const mercadoPagoCheckout = await createMercadoPagoPreference({
              externalReference,
              customerName: clienteNomePedido,
              items: checkoutItems,
              pagamento: body.pagamento,
              tipoCartao: body.pagamento === 'CARTAO' ? tipoCartaoPedido : null,
              successUrl: buildHostedReturnUrl(pedidoId, 'success', returnToken, hostedCheckoutGateway),
              failureUrl: buildHostedReturnUrl(pedidoId, 'cancel', returnToken, hostedCheckoutGateway),
              pendingUrl: buildHostedReturnUrl(pedidoId, 'success', returnToken, hostedCheckoutGateway),
              notificationUrl: getMercadoPagoWebhookUrl(),
            })

            hostedCheckout = {
              id: mercadoPagoCheckout.id,
              link: mercadoPagoCheckout.link,
              expiresAt: getMercadoPagoLocalReuseExpiryDate(),
              status: 'PREFERENCE_CREATED',
            }
          }
        }
      } catch (error) {
        appLogger.error('[api/pedidos] Falha ao criar checkout hospedado', error)
        const providerStatus = getProviderErrorStatus(error)

        if (providerStatus === 401 || providerStatus === 403) {
          return NextResponse.json(
            { error: 'O gateway de pagamento recusou as credenciais deste ambiente. Revise as chaves do Mercado Pago/Asaas antes de testar novamente.' },
            { status: 502 },
          )
        }

        if (
          (isAsaasApiError(error) && error.status < 500) ||
          (isMercadoPagoApiError(error) && error.status < 500)
        ) {
          return NextResponse.json(
            { error: 'Nao foi possivel iniciar o pagamento online agora. Confira os dados e tente novamente.' },
            { status: 502 },
          )
        }
        return NextResponse.json(
          { error: 'Pagamento online indisponivel no momento. Tente novamente em instantes.' },
          { status: 502 },
        )
      }
    }

    const cliente = existingCliente
      ? { id: existingCliente.id }
      : await prisma.cliente.create({
          data: {
            tenantId: tenant.id,
            nome: body.clienteNome.trim(),
            telefone: telefoneLimpo,
            whatsapp: whatsappLimpo || telefoneLimpo,
            clienteBloco: body.clienteBloco?.trim() ?? null,
            clienteApartamento: body.clienteApartamento?.trim() ?? null,
            observacoes: null,
          },
          select: { id: true },
        })

    const novoPedido = await prisma.$transaction(async (tx) => {
      await lockProductStockRows(tx, tenant.id, itemIds)

      const produtosAtualizados = await tx.produto.findMany({
        where: {
          id: { in: itemIds },
          descontinuado: false,
          tenantId: tenant.id,
        },
        select: {
          id: true,
          nome: true,
          ativo: true,
          disponivelParaEncomenda: true,
          estoqueProdutos: {
            where: { tenantId: tenant.id },
            select: { quantidadeDisponivel: true },
            take: 1,
          },
        },
      })
      const shadowCommittedMapTx = await loadShadowCommittedQuantityMapTx(tx, tenant.id)
      const produtosAtualizadosMap = new Map(produtosAtualizados.map((produto) => [produto.id, produto]))
      const itensSomenteEncomendaTx = new Set<string>()

      for (const item of body.itens) {
        const produtoAtualizado = produtosAtualizadosMap.get(item.produtoId)
        if (!produtoAtualizado) {
          throw new PublicOrderCheckoutError(
            'Um dos produtos saiu do cardapio enquanto seu pedido era finalizado. Atualize a pagina e tente novamente.',
          )
        }

        const estoqueDisponivelAtual = Math.max(
          0,
          (produtoAtualizado.estoqueProdutos[0]?.quantidadeDisponivel ?? 0) - (shadowCommittedMapTx.get(produtoAtualizado.id) ?? 0),
        )
        const statusDisponibilidadeAtual = resolveProductOrderMode({
          requestedQty: item.quantidade,
          ativoNoCatalogo: produtoAtualizado.ativo,
          estoqueDisponivel: estoqueDisponivelAtual,
          disponivelParaEncomenda: produtoAtualizado.disponivelParaEncomenda,
          encomendaHabilitada: entregaEncomendaDisponivel,
        })

        if (statusDisponibilidadeAtual === 'INDISPONIVEL') {
          throw new PublicOrderCheckoutError(
            `${produtoAtualizado.nome} ficou indisponivel enquanto outro pedido era processado. Revise o carrinho e tente novamente.`,
          )
        }

        if (statusDisponibilidadeAtual === 'SOMENTE_ENCOMENDA') {
          itensSomenteEncomendaTx.add(produtoAtualizado.nome)
        }
      }

      if (itensSomenteEncomendaTx.size > 0 && body.tipoEntrega !== 'ENCOMENDA') {
        throw new PublicOrderCheckoutError(
          `Alguns itens acabaram de ficar disponiveis apenas por encomenda: ${Array.from(itensSomenteEncomendaTx).join(', ')}.`,
        )
      }

      const pedido = await tx.pedido.create({
        data: {
          id: pedidoId,
          clienteId: cliente.id,
          status: 'FEITO',
          publicAccessTokenHash: hashPublicOrderAccessToken(publicAccessToken),
          publicAccessTokenIssuedAt: new Date(),
          asaasReturnTokenHash: hostedCheckout && hostedCheckoutReturnToken ? hashAsaasReturnToken(hostedCheckoutReturnToken) : null,
          clienteNome: clienteNomePedido,
          clienteTelefone: telefoneLimpo,
          clienteWhatsapp: clienteWhatsappPedido || null,
          clienteBloco: body.clienteBloco?.trim() ?? null,
          clienteApartamento: body.clienteApartamento?.trim() ?? null,
          pagamento: body.pagamento,
          tipoCartao: tipoCartaoPedido,
          statusPagamento: body.pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE',
          asaasCheckoutId: hostedCheckout?.id ?? null,
          asaasCheckoutUrl: hostedCheckout?.link ?? null,
          asaasCheckoutExpiresAt: hostedCheckout?.expiresAt ?? null,
          asaasPaymentId:
            body.pagamento === 'PIX' && hostedCheckoutGateway === 'MERCADO_PAGO'
              ? hostedCheckout?.id ?? null
              : null,
          asaasPixQrCode: hostedCheckout?.pixQrCode ?? null,
          asaasPixCopyPaste: hostedCheckout?.pixCopyPaste ?? null,
          asaasPaymentStatus: hostedCheckout?.status ?? null,
          tipoEntrega: body.tipoEntrega,
          encomendaPara: encomendaParaPedido,
          enderecoEntrega: null,
          enderecoRetirada: configuracao?.enderecoRetirada ?? '',
          frete,
          subtotal,
          total: Math.max(0, total),
          motivoCancelamento: null,
          distanciaKm: null,
          descontoValor: descontoValor > 0 ? descontoValor : null,
          cupomCodigoSnapshot: cupomCodigoSnapshot ?? null,
          cupomId: cupomId ?? null,
          tenantId: tenant.id,
          itens: {
            create: itens.map((item) => ({
              produtoId: item.produtoId,
              nomeProdutoSnapshot: item.nomeProdutoSnapshot,
              precoUnitarioSnapshot: item.precoUnitarioSnapshot,
              quantidade: item.quantidade,
              totalItem: item.totalItem,
            })),
          },
        },
        include: { itens: true },
      })

      if (cupomId) {
        await tx.cupom.update({
          where: { id: cupomId },
          data: { usos: { increment: 1 } },
        })
      }

      await registrarLogOperacao(tx, {
        tenantId: tenant.id,
        tipo: 'PEDIDO_CRIADO',
        descricao: `Pedido #${numeroPedidoCurto(pedido.id) ?? pedido.id} criado pelo checkout.`,
        actorNome: 'Cliente',
        pedidoId: pedido.id,
        pedidoNumero: numeroPedidoCurto(pedido.id),
        quantidade: pedido.itens.reduce((acc, item) => acc + item.quantidade, 0),
        metadata: {
          origem: 'CHECKOUT',
          tipoEntrega: pedido.tipoEntrega,
          tipoCartao: pedido.tipoCartao,
          statusPagamento: pedido.statusPagamento,
          gatewayPagamento: hostedCheckoutGateway ?? 'MANUAL',
        },
      })

      return pedido
    })

    appLogger.info('[api/pedidos] Novo pedido criado: %s', novoPedido.id)

    const response = NextResponse.json(serializePublicPedido(novoPedido), { status: 201 })
    setPublicOrderAccessCookie(response, novoPedido.id, publicAccessToken)
    setPublicCustomerAccessCookie(response, tenant.id, clienteWhatsappPedido || telefoneLimpo)
    return response
  } catch (error) {
    if (error instanceof PublicOrderCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[v0] Erro ao criar pedido:', error)
    return NextResponse.json({ error: 'Erro interno ao processar pedido' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Metodo nao permitido' }, { status: 405 })
}
