import { calcularTaxaCartao, isPedidoRealizadoFinanceiramente, normalizeTipoCartao } from '@/lib/order-finance'
import type { ContaPagar, Pedido, StatusContaPagar } from '@/lib/types'

export const statusContaPagarLabels: Record<StatusContaPagar, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
}

export const statusContaPagarStyles: Record<StatusContaPagar, string> = {
  PENDENTE: 'border-warning/35 bg-warning/10 text-warning-foreground',
  PAGO: 'border-success/35 bg-success/10 text-success-foreground',
  CANCELADO: 'border-destructive/25 bg-destructive/10 text-destructive',
}

export type ContaReceberResumoStatus = 'PREVISTO' | 'REALIZADO' | 'CANCELADO'

export const contaReceberStatusLabels: Record<ContaReceberResumoStatus, string> = {
  PREVISTO: 'Previsto',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
}

export function getPedidoFinanceiroStatus(pedido: Pick<Pedido, 'pagamento' | 'status' | 'statusPagamento'>): ContaReceberResumoStatus {
  if (pedido.status === 'CANCELADO') return 'CANCELADO'
  return isPedidoRealizadoFinanceiramente(pedido) ? 'REALIZADO' : 'PREVISTO'
}

export function calcularLiquidoPedido(pedido: Pick<Pedido, 'pagamento' | 'tipoCartao' | 'total'>) {
  if (pedido.pagamento !== 'CARTAO') return { taxa: 0, liquido: pedido.total }
  const tipoCartao = normalizeTipoCartao(pedido.pagamento, pedido.tipoCartao)
  const taxa = calcularTaxaCartao(pedido.total, tipoCartao)
  return { taxa, liquido: Math.max(0, pedido.total - taxa) }
}

export function getContaPagarStatusFinanceiro(conta: Pick<ContaPagar, 'status'>) {
  if (conta.status === 'PAGO') return 'REALIZADO'
  if (conta.status === 'CANCELADO') return 'CANCELADO'
  return 'PREVISTO'
}

export function groupByDateKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
