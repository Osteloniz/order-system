import type { StatusPagamento, StatusPedido, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'

export const pagamentoLabels: Record<TipoPagamento, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartao',
}

export const tipoCartaoLabels: Record<TipoCartao, string> = {
  CREDITO: 'Credito',
  DEBITO: 'Debito',
}

export function getPagamentoLabel(pagamento: TipoPagamento, tipoCartao?: TipoCartao | null) {
  if (pagamento !== 'CARTAO') return pagamentoLabels[pagamento]
  const subtipo = tipoCartao ? tipoCartaoLabels[tipoCartao] : tipoCartaoLabels.CREDITO
  return `Cartao (${subtipo})`
}

export const entregaLabels: Record<TipoEntrega, string> = {
  RESERVA_PAULISTANO: 'Condominio',
  RETIRADA: 'Retirada',
  ENCOMENDA: 'Encomenda',
}

export const statusPagamentoLabels: Record<StatusPagamento, string> = {
  NAO_APLICAVEL: 'Na entrega',
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado',
  REEMBOLSADO: 'Reembolsado',
}

export const statusPagamentoLabelsLong: Record<StatusPagamento, string> = {
  NAO_APLICAVEL: 'Pagamento na entrega',
  PENDENTE: 'Pagamento pendente',
  APROVADO: 'Pagamento aprovado',
  RECUSADO: 'Pagamento recusado',
  CANCELADO: 'Pagamento cancelado',
  REEMBOLSADO: 'Pagamento reembolsado',
}

export const statusPagamentoColors: Record<StatusPagamento, string> = {
  NAO_APLICAVEL: 'bg-secondary text-secondary-foreground',
  PENDENTE: 'bg-warning text-warning-foreground',
  APROVADO: 'bg-success text-success-foreground',
  RECUSADO: 'bg-destructive text-destructive-foreground',
  CANCELADO: 'bg-destructive text-destructive-foreground',
  REEMBOLSADO: 'bg-accent text-accent-foreground',
}

export const statusPedidoShortLabels: Record<StatusPedido, string> = {
  FEITO: 'Recebido',
  ACEITO: 'Aceito',
  PREPARACAO: 'Preparando',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export const statusPedidoReportLabels: Record<StatusPedido, string> = {
  FEITO: 'Novos',
  ACEITO: 'Aceitos',
  PREPARACAO: 'Em preparo',
  ENTREGUE: 'Entregues',
  CANCELADO: 'Cancelados',
}

export const statusPedidoReportStyles: Record<StatusPedido, string> = {
  FEITO: 'border-[#F8CF40]/50 bg-[#F8CF40]/15 text-[#7a5713]',
  ACEITO: 'border-[#FF6BBB]/45 bg-[#FF6BBB]/12 text-[#8a2861]',
  PREPARACAO: 'border-[#22C0D4]/45 bg-[#22C0D4]/12 text-[#0e6c77]',
  ENTREGUE: 'border-[#AF6E2A]/45 bg-[#AF6E2A]/12 text-[#744516]',
  CANCELADO: 'border-destructive/35 bg-destructive/10 text-destructive',
}
