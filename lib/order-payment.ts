import { Prisma } from '@prisma/client'
import {
  createAsaasCheckout,
  deleteAsaasPayment,
  formatAsaasAmountFromCents,
  hasActiveAsaasPixKey,
  isAsaasConfigured,
  normalizeAsaasPhone,
} from '@/lib/asaas'
import { getAppUrl } from '@/lib/app-url'
import { appLogger } from '@/lib/app-logger'
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

function buildAsaasReturnUrl(orderId: string, status: 'success' | 'cancel' | 'expired', returnToken: string) {
  return `${getAppUrl()}/pagamento/asaas/${encodeURIComponent(orderId)}?status=${status}&token=${encodeURIComponent(returnToken)}`
}

function getCheckoutExpiryDate(minutes?: number) {
  const expiryMinutes = Number.isFinite(minutes) && minutes ? minutes : 60
  return new Date(Date.now() + expiryMinutes * 60 * 1000)
}

function isCheckoutExpired(expiresAt?: Date | null) {
  if (!expiresAt) return true
  return expiresAt.getTime() <= Date.now()
}

export function hasReusableHostedCheckout(pedido: Pick<PedidoPagamentoBase, 'status' | 'statusPagamento' | 'pagamento' | 'asaasCheckoutUrl' | 'asaasCheckoutExpiresAt'>) {
  if (pedido.status === 'CANCELADO') return false
  if (pedido.pagamento === 'DINHEIRO') return false
  if (pedido.statusPagamento !== 'PENDENTE') return false
  if (!pedido.asaasCheckoutUrl?.trim()) return false
  return !isCheckoutExpired(pedido.asaasCheckoutExpiresAt)
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

export function buildHostedCheckoutItemsFromOrder(pedido: HostedCheckoutOrderLike) {
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
      quantity: 1,
      value: formatAsaasAmountFromCents(line.targetTotalCents),
    }))
}

async function validateHostedPaymentTarget(pagamento: TipoPagamento, tipoCartao?: TipoCartao | null) {
  if (pagamento === 'DINHEIRO') return

  if (!isAsaasConfigured()) {
    throw new Error('Pagamento online indisponivel no momento.')
  }

  if (pagamento === 'PIX') {
    const pixDisponivel = await hasActiveAsaasPixKey()
    if (!pixDisponivel) {
      throw new Error('A conta de pagamento ainda nao possui chave Pix ativa.')
    }
    return
  }

  if (pagamento === 'CARTAO' && tipoCartao === 'DEBITO') {
    throw new Error('Cartao de debito online ainda nao esta disponivel.')
  }
}

async function tryDeleteCurrentAsaasPayment(paymentId?: string | null) {
  if (!paymentId) return

  try {
    await deleteAsaasPayment(paymentId)
  } catch (error) {
    appLogger.warn('[order-payment] Nao foi possivel excluir a cobranca anterior do Asaas', error)
  }
}

async function createHostedCheckout(
  tx: Tx,
  pedido: PedidoPagamentoBase,
  pagamento: Exclude<TipoPagamento, 'DINHEIRO'>,
  tipoCartao?: TipoCartao | null,
) {
  await validateHostedPaymentTarget(pagamento, tipoCartao)
  const checkoutItems = buildHostedCheckoutItemsFromOrder(pedido)

  if (checkoutItems.length === 0) {
    throw new Error('Esse pedido nao possui valor valido para pagamento online.')
  }

  const returnToken = generateAsaasReturnToken()
  const checkout = await createAsaasCheckout({
    externalReference: pedido.id,
    customerName: pedido.clienteNome?.trim() || undefined,
    customerPhone: pedido.clienteWhatsapp || pedido.clienteTelefone
      ? normalizeAsaasPhone(pedido.clienteWhatsapp || pedido.clienteTelefone || '')
      : undefined,
    billingTypes: pagamento === 'PIX' ? ['PIX'] : ['CREDIT_CARD'],
    items: checkoutItems,
    successUrl: buildAsaasReturnUrl(pedido.id, 'success', returnToken),
    cancelUrl: buildAsaasReturnUrl(pedido.id, 'cancel', returnToken),
    expiredUrl: buildAsaasReturnUrl(pedido.id, 'expired', returnToken),
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
      asaasCheckoutExpiresAt: getCheckoutExpiryDate(checkout.minutesToExpire),
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

  await tryDeleteCurrentAsaasPayment(pedido.asaasPaymentId)
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

    await tryDeleteCurrentAsaasPayment(pedido.asaasPaymentId)
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
