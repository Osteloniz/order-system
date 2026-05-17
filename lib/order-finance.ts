import type { StatusPagamento, StatusPedido, TipoCartao, TipoPagamento } from '@/lib/types'

export const CARD_FEE_RATES: Record<TipoCartao, number> = {
  DEBITO: 0.0089,
  CREDITO: 0.0309,
}

export function normalizeTipoCartao(pagamento: TipoPagamento, tipoCartao?: TipoCartao | null) {
  if (pagamento !== 'CARTAO') return null
  return tipoCartao ?? 'CREDITO'
}

export function getCardFeeRate(tipoCartao?: TipoCartao | null) {
  const normalized = normalizeTipoCartao('CARTAO', tipoCartao)
  return normalized ? CARD_FEE_RATES[normalized] : 0
}

export function calcularTaxaCartao(totalEmCentavos: number, tipoCartao?: TipoCartao | null) {
  return Math.round(totalEmCentavos * getCardFeeRate(tipoCartao))
}

export function isPedidoRealizadoFinanceiramente(pedido: {
  pagamento: TipoPagamento
  status: StatusPedido
  statusPagamento: StatusPagamento
}) {
  return pedido.statusPagamento === 'APROVADO' || (pedido.pagamento === 'DINHEIRO' && pedido.status === 'ENTREGUE')
}
