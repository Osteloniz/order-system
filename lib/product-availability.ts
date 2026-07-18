import type { StatusDisponibilidadeProduto } from '@/lib/types'

type ResolveProductOrderModeInput = {
  requestedQty?: number
  ativoNoCatalogo?: boolean
  estoqueDisponivel: number
  disponivelParaEncomenda: boolean
  encomendaHabilitada: boolean
}

export function resolveProductOrderMode({
  requestedQty = 1,
  ativoNoCatalogo = true,
  estoqueDisponivel,
  disponivelParaEncomenda,
  encomendaHabilitada,
}: ResolveProductOrderModeInput): StatusDisponibilidadeProduto {
  if (!ativoNoCatalogo) {
    return 'INDISPONIVEL'
  }

  if (estoqueDisponivel >= requestedQty) {
    return 'DISPONIVEL'
  }

  if (disponivelParaEncomenda && encomendaHabilitada) {
    return 'SOMENTE_ENCOMENDA'
  }

  return 'INDISPONIVEL'
}
