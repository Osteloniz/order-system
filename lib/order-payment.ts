import { Prisma } from '@prisma/client'
import {
  createAsaasCheckout,
  deleteAsaasPayment,
  formatAsaasAmountFromCents,
  hasActiveAsaasPixKey,
  isAsaasConfigured,
  normalizeAsaasPhone,
} from '@/lib/asaas'
import { appLogger } from '@/lib/app-logger'
import {
  buildHostedReturnUrl,
  inferHostedCheckoutGateway,
  type OnlinePaymentGateway,
} from '@/lib/hosted-payment'
import {
  createMercadoPagoPreference,
  getMercadoPagoLocalReuseExpiryDate,
  getMercadoPagoWebhookUrl,
  isMercadoPagoConfigured,
} from '@/lib/mercado-pago'
import { getOnlinePaymentGateway } from '@/lib/payment-gateway'
import { generateAsaasReturnToken, hashAsaasReturnToken } from '@/lib/public-order-access'
import type { TipoCartao, TipoPagamento } from '@/lib/types'

type Tx = Prisma.TransactionClient

type PedidoPagamentoBase = {
  id: string
  tenantId: string | null
  status: 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'PRONTO_ENTREGA' | 'ENTREGUE' | 'CANCELADO'
  statusPagamento: 'NAO_APLICAVEL' | 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REEMBOLSADO'
  pagamento: TipoPagamento
  tipoCartao: TipoCartao | null
  clienteNome: string
  clienteTelefone: string | null
  clienteWhatsapp: string | null
  asaasReturnTokenHash: string | null
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
  frete: number
  subtotal: number
  total: number
  descontoValor: number | null
  cupomCodigoSnapshot?: string | null
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
}

type PedidoPagamentoAtualizado = PedidoPagamentoBase

type CheckoutRefreshResult = {
  pedido: PedidoPagamentoAtualizado
  reused: boolean
}

type HostedCheckoutOrderLike = {
  frete: number
  subtotal: number
  total: number
  descontoValor: number | null
  itens: Array<{
    produtoId: string
    nomeProdutoSnapshot: string
    quantidade: number
    totalItem: number
  }>
}

type HostedCheckoutLine = {
  externalReference: string
  name: string
  baseTotalCents: number
  targetTotalCents: number
}

function getAsaasCheckoutExpiryDate(minutes?: number) {
  const expiryMinutes = Number.isFinite(minutes) && minutes ? minutes : 60
  return new Date(Date.now() + expiryMinutes * 60 * 1000)
}

function isCheckoutExpired(expiresAt?: Date | null) {
  if (!expiresAt) return true
  return expiresAt.getTime() <= Date.now()
}

function applyReductionToLines(lines: HostedCheckoutLine[], reductionCents: number) {
  if (reductionCents <= 0 || lines.length === 0) return reductionCents

  const totalWeight = lines.reduce((acc, line) => acc + line.targetTotalCents, 0)
  if (totalWeight <= 0) return reductionCents

  const provisional = lines.map((line, index) => {
    const exactShare = (reductionCents * line.targetTotalCents) / totalWeight
    const floorShare = Math.min(line.targetTotalCents, Math.floor(exactShare))
    return {
      index,
      floorShare,
      remainder: exactShare - floorShare,
      capacity: line.targetTotalCents - floorShare,
    }
  })

  let allocated = provisional.reduce((acc, entry) => acc + entry.floorShare, 0)
  const sorted = provisional
    .filter((entry) => entry.capacity > 0)
    .sort((a, b) => b.remainder - a.remainder || b.capacity - a.capacity)

  let cursor = 0
  while (allocated < reductionCents && sorted.length > 0) {
    const entry = sorted[cursor % sorted.length]
    if (entry.floorShare < lines[entry.index].targetTotalCents) {
      entry.floorShare += 1
      allocated += 1
    }
    cursor += 1
  }

  for (const entry of provisional) {
    lines[entry.index].targetTotalCents = Math.max(0, lines[entry.index].targetTotalCents - entry.floorShare)
  }

  return reductionCents - allocated
}

export function buildHostedCheckoutLinesFromOrder(pedido: HostedCheckoutOrderLike) {
  const productLines: HostedCheckoutLine[] = pedido.itens.map((item, index) => ({
    externalReference: `${item.produtoId}:${index}`,
    name: item.quantidade > 1 ? `${item.quantidade}x ${item.nomeProdutoSnapshot}` : item.nomeProdutoSnapshot,
    baseTotalCents: item.totalItem,
    targetTotalCents: item.totalItem,
  }))

  const shippingCents = Math.max(0, pedido.frete ?? 0)
  const shippingLine: HostedCheckoutLine | null = shippingCents > 0
    ? {
        externalReference: 'frete',
        name: 'Taxa de entrega',
        baseTotalCents: shippingCents,
        targetTotalCents: shippingCents,
      }
    : null

  const allBaseTotal = productLines.reduce((acc, line) => acc + line.baseTotalCents, 0) + (shippingLine?.baseTotalCents ?? 0)
  const desiredTotal = Math.max(0, pedido.total)

  if (desiredTotal < allBaseTotal) {
    let remainingReduction = allBaseTotal - desiredTotal
    remainingReduction = applyReductionToLines(productLines, remainingReduction)
    if (remainingReduction > 0 && shippingLine) {
      applyReductionToLines([shippingLine], remainingReduction)
    }
  } else if (desiredTotal > allBaseTotal) {
    const surcharge = desiredTotal - allBaseTotal
    if (shippingLine) {
      shippingLine.targetTotalCents += surcharge
    } else if (productLines.length > 0) {
      productLines[productLines.length - 1].targetTotalCents += surcharge
    }
  }

  return [...productLines, ...(shippingLine ? [shippingLine] : [])]
    .filter((line) => line.targetTotalCents > 0)
    .map((line) => ({
      externalReference: line.externalReference,
      name: line.name,
      totalCents: line.targetTotalCents,
    }))
}

export function buildHostedCheckoutItemsFromOrder(pedido: HostedCheckoutOrderLike) {
  return buildHostedCheckoutLinesFromOrder(pedido).map((line) => ({
    externalReference: line.externalReference,
    name: line.name,
    quantity: 1,
    value: formatAsaasAmountFromCents(line.totalCents),
  }))
}

export function buildMercadoPagoHostedCheckoutItemsFromOrder(pedido: HostedCheckoutOrderLike) {
  return buildHostedCheckoutLinesFromOrder(pedido).map((line) => ({
    id: line.externalReference,
    title: line.name,
    quantity: 1,
    unit_price: line.totalCents / 100,
    currency_id: 'BRL' as const,
  }))
}

async function validateHostedPaymentTarget(
  pagamento: TipoPagamento,
  tipoCartao?: TipoCartao | null,
): Promise<OnlinePaymentGateway> {
  if (pagamento === 'DINHEIRO') {
    throw new Error('Pagamento em dinheiro nao usa checkout online.')
  }

  const gateway = getOnlinePaymentGateway()
  if (!gateway.gateway) {
    throw new Error('Pagamento online indisponivel no momento.')
  }

  if (gateway.gateway === 'ASAAS') {
    if (!isAsaasConfigured()) {
      throw new Error('Pagamento online indisponivel no momento.')
    }

    if (pagamento === 'PIX') {
      const pixDisponivel = await hasActiveAsaasPixKey()
      if (!pixDisponivel) {
        throw new Error('A conta de pagamento ainda nao possui chave Pix ativa.')
      }
      return gateway.gateway
    }

    if (pagamento === 'CARTAO' && tipoCartao === 'DEBITO') {
      throw new Error('Cartao de debito online ainda nao esta disponivel.')
    }

    return gateway.gateway
  }

  if (!isMercadoPagoConfigured()) {
    throw new Error('Pagamento online indisponivel no momento.')
  }

  return gateway.gateway
}

async function tryDeleteCurrentHostedPayment(pedido: Pick<PedidoPagamentoBase, 'asaasCheckoutUrl' | 'asaasPaymentId'>) {
  if (!pedido.asaasPaymentId) return

  const currentGateway = inferHostedCheckoutGateway(pedido.asaasCheckoutUrl)
  if (currentGateway !== 'ASAAS') return

  try {
    await deleteAsaasPayment(pedido.asaasPaymentId)
  } catch (error) {
    appLogger.warn('[order-payment] Nao foi possivel excluir a cobranca anterior do Asaas', error)
  }
}

export function hasReusableHostedCheckout(
  pedido: Pick<PedidoPagamentoBase, 'status' | 'statusPagamento' | 'pagamento' | 'asaasCheckoutUrl' | 'asaasCheckoutExpiresAt'>,
) {
  if (pedido.status === 'CANCELADO') return false
  if (pedido.pagamento === 'DINHEIRO') return false
  if (pedido.statusPagamento !== 'PENDENTE') return false
  if (!pedido.asaasCheckoutUrl?.trim()) return false

  const currentGateway = inferHostedCheckoutGateway(pedido.asaasCheckoutUrl)
  if (currentGateway === 'MERCADO_PAGO') {
    return true
  }

  return !isCheckoutExpired(pedido.asaasCheckoutExpiresAt)
}

async function createHostedCheckout(
  tx: Tx,
  pedido: PedidoPagamentoBase,
  pagamento: Exclude<TipoPagamento, 'DINHEIRO'>,
  tipoCartao?: TipoCartao | null,
) {
  const gateway = await validateHostedPaymentTarget(pagamento, tipoCartao)
  const returnToken = generateAsaasReturnToken()

  if (gateway === 'ASAAS') {
    const checkoutItems = buildHostedCheckoutItemsFromOrder(pedido)
    if (checkoutItems.length === 0) {
      throw new Error('Esse pedido nao possui valor valido para pagamento online.')
    }

    const checkout = await createAsaasCheckout({
      externalReference: pedido.id,
      customerName: pedido.clienteNome?.trim() || undefined,
      customerPhone: pedido.clienteWhatsapp || pedido.clienteTelefone
        ? normalizeAsaasPhone(pedido.clienteWhatsapp || pedido.clienteTelefone || '')
        : undefined,
      billingTypes: pagamento === 'PIX' ? ['PIX'] : ['CREDIT_CARD'],
      items: checkoutItems,
      successUrl: buildHostedReturnUrl(pedido.id, 'success', returnToken, gateway),
      cancelUrl: buildHostedReturnUrl(pedido.id, 'cancel', returnToken, gateway),
      expiredUrl: buildHostedReturnUrl(pedido.id, 'expired', returnToken, gateway),
    })

    return tx.pedido.update({
      where: { id: pedido.id },
      data: {
        pagamento,
        tipoCartao: pagamento === 'CARTAO' ? (tipoCartao ?? 'CREDITO') : null,
        statusPagamento: 'PENDENTE',
        asaasReturnTokenHash: hashAsaasReturnToken(returnToken),
        asaasCheckoutId: checkout.id,
        asaasCheckoutUrl: checkout.link,
        asaasCheckoutExpiresAt: getAsaasCheckoutExpiryDate(checkout.minutesToExpire),
        asaasPaymentId: null,
        asaasInvoiceUrl: null,
        asaasPixQrCode: null,
        asaasPixCopyPaste: null,
        asaasPaymentStatus: checkout.status ?? null,
        asaasLastEventId: null,
        asaasLastSyncAt: null,
      },
      include: { itens: true },
    })
  }

  const checkoutItems = buildMercadoPagoHostedCheckoutItemsFromOrder(pedido)
  if (checkoutItems.length === 0) {
    throw new Error('Esse pedido nao possui valor valido para pagamento online.')
  }

  const externalReference = `${pedido.id}:${returnToken}`
  const checkout = await createMercadoPagoPreference({
    externalReference,
    customerName: pedido.clienteNome?.trim() || undefined,
    items: checkoutItems,
    pagamento,
    tipoCartao,
    successUrl: buildHostedReturnUrl(pedido.id, 'success', returnToken, gateway),
    failureUrl: buildHostedReturnUrl(pedido.id, 'cancel', returnToken, gateway),
    pendingUrl: buildHostedReturnUrl(pedido.id, 'success', returnToken, gateway),
    notificationUrl: getMercadoPagoWebhookUrl(),
  })

  return tx.pedido.update({
    where: { id: pedido.id },
    data: {
      pagamento,
      tipoCartao: pagamento === 'CARTAO' ? (tipoCartao ?? 'CREDITO') : null,
      statusPagamento: 'PENDENTE',
      asaasReturnTokenHash: hashAsaasReturnToken(returnToken),
      asaasCheckoutId: checkout.id,
      asaasCheckoutUrl: checkout.link,
      asaasCheckoutExpiresAt: getMercadoPagoLocalReuseExpiryDate(),
      asaasPaymentId: null,
      asaasInvoiceUrl: null,
      asaasPixQrCode: null,
      asaasPixCopyPaste: null,
      asaasPaymentStatus: 'PREFERENCE_CREATED',
      asaasLastEventId: null,
      asaasLastSyncAt: null,
    },
    include: { itens: true },
  })
}

export async function ensureOrderHostedCheckout(
  tx: Tx,
  pedido: PedidoPagamentoBase,
  options?: {
    pagamento?: Exclude<TipoPagamento, 'DINHEIRO'>
    tipoCartao?: TipoCartao | null
  },
): Promise<CheckoutRefreshResult> {
  const pagamento = options?.pagamento ?? (pedido.pagamento === 'DINHEIRO' ? 'PIX' : pedido.pagamento)
  const tipoCartao = pagamento === 'CARTAO' ? (options?.tipoCartao ?? pedido.tipoCartao ?? 'CREDITO') : null

  if (pedido.status === 'CANCELADO') {
    throw new Error('Pedido cancelado nao pode receber novo link.')
  }

  if (pedido.statusPagamento === 'APROVADO') {
    throw new Error('Esse pedido ja esta com pagamento aprovado.')
  }

  if (pagamento !== pedido.pagamento && hasReusableHostedCheckout(pedido)) {
    throw new Error('O link atual ainda esta ativo. Reutilize ou aguarde expirar antes de trocar a forma de pagamento.')
  }

  if (
    pagamento === pedido.pagamento &&
    tipoCartao === (pedido.tipoCartao ?? null) &&
    hasReusableHostedCheckout(pedido)
  ) {
    return { pedido, reused: true }
  }

  await tryDeleteCurrentHostedPayment(pedido)
  const atualizado = await createHostedCheckout(tx, pedido, pagamento, tipoCartao)
  return { pedido: atualizado, reused: false }
}

export async function switchOrderPaymentMethod(
  tx: Tx,
  pedido: PedidoPagamentoBase,
  target: {
    pagamento: TipoPagamento
    tipoCartao?: TipoCartao | null
  },
) {
  if (pedido.status === 'CANCELADO') {
    throw new Error('Pedido cancelado nao pode ter o pagamento alterado.')
  }

  if (pedido.statusPagamento === 'APROVADO') {
    throw new Error('Pedido com pagamento aprovado nao pode trocar a forma de pagamento.')
  }

  if (target.pagamento === 'DINHEIRO') {
    if (hasReusableHostedCheckout(pedido)) {
      throw new Error('O link online atual ainda esta ativo. Aguarde expirar antes de trocar para dinheiro.')
    }

    await tryDeleteCurrentHostedPayment(pedido)
    return tx.pedido.update({
      where: { id: pedido.id },
      data: {
        pagamento: 'DINHEIRO',
        tipoCartao: null,
        statusPagamento: 'NAO_APLICAVEL',
        asaasReturnTokenHash: null,
        asaasCheckoutId: null,
        asaasCheckoutUrl: null,
        asaasCheckoutExpiresAt: null,
        asaasPaymentId: null,
        asaasInvoiceUrl: null,
        asaasPixQrCode: null,
        asaasPixCopyPaste: null,
        asaasPaymentStatus: null,
        asaasLastEventId: null,
        asaasLastSyncAt: null,
      },
      include: { itens: true },
    })
  }

  const refreshed = await ensureOrderHostedCheckout(tx, pedido, {
    pagamento: target.pagamento,
    tipoCartao: target.tipoCartao ?? null,
  })

  return refreshed.pedido
}
