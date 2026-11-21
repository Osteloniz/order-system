import { CARD_FEE_RATES } from '@/lib/order-finance'

export const caixaFeeSelection = {
  caixaTaxaCreditoBp: true,
  caixaTaxaDebitoBp: true,
} as const

export type CaixaFeeRates = Record<keyof typeof caixaFeeSelection, number>

export const defaultCaixaFeeRates: CaixaFeeRates = {
  caixaTaxaCreditoBp: Math.round(CARD_FEE_RATES.CREDITO * 10_000),
  caixaTaxaDebitoBp: Math.round(CARD_FEE_RATES.DEBITO * 10_000),
}

export function caixaFeeRate(meio: string | null, rates: CaixaFeeRates = defaultCaixaFeeRates) {
  if (meio === 'CREDITO') return rates.caixaTaxaCreditoBp
  if (meio === 'DEBITO') return rates.caixaTaxaDebitoBp
  return 0
}

export function calcularTaxaCaixa(total: number, meio: string | null, rates?: CaixaFeeRates) {
  return Math.round(total * caixaFeeRate(meio, rates) / 10_000)
}
