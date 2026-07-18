import type { StatusPagamento, StatusPedido, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'

export const pagamentoLabels: Record<TipoPagamento, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
}

export const tipoCartaoLabels: Record<TipoCartao, string> = {
  CREDITO: 'Crédito',
  DEBITO: 'Débito',
}

export function getPagamentoLabel(pagamento: TipoPagamento, tipoCartao?: TipoCartao | null) {
  if (pagamento !== 'CARTAO') return pagamentoLabels[pagamento]
  if (!tipoCartao) return pagamentoLabels[pagamento]
  const subtipo = tipoCartaoLabels[tipoCartao]
  return `Cartão (${subtipo})`
}

export const entregaLabels: Record<TipoEntrega, string> = {
  ENTREGA: 'Entrega',
  RESERVA_PAULISTANO: 'Condomínio',
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
  PRONTO_ENTREGA: 'Pronto entrega',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export const statusPedidoReportLabels: Record<StatusPedido, string> = {
  FEITO: 'Novos',
  ACEITO: 'Aceitos',
  PREPARACAO: 'Em preparo',
  PRONTO_ENTREGA: 'Pronto entrega',
  ENTREGUE: 'Entregues',
  CANCELADO: 'Cancelados',
}

export const statusPedidoReportStyles: Record<StatusPedido, string> = {
  FEITO: 'border-warning/45 bg-warning/15 text-warning-foreground',
  ACEITO: 'border-accent/45 bg-accent/45 text-accent-foreground',
  PREPARACAO: 'border-primary/35 bg-primary/12 text-primary',
  PRONTO_ENTREGA: 'border-success/35 bg-success/10 text-success-foreground',
  ENTREGUE: 'border-secondary/35 bg-secondary/12 text-secondary-foreground',
  CANCELADO: 'border-destructive/35 bg-destructive/10 text-destructive',
}
