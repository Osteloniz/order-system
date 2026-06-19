import { MIMO_COOKIE_THRESHOLD } from './mimos.ts'

type PedidoResumoItem = {
  nomeProdutoSnapshot: string
  quantidade: number
}

type PedidoResumo = {
  itens: PedidoResumoItem[]
}

export function buildClienteResumoConsumo(pedidos: PedidoResumo[]) {
  const sabores = new Map<string, number>()
  let totalCookies = 0

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      totalCookies += item.quantidade
      sabores.set(item.nomeProdutoSnapshot, (sabores.get(item.nomeProdutoSnapshot) ?? 0) + item.quantidade)
    }
  }

  return {
    totalCookies,
    sabores: Array.from(sabores.entries())
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => {
        if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
        return a.nome.localeCompare(b.nome)
      }),
  }
}

export function buildClienteFidelidade(totalCookies: number, mimosEntregues: number) {
  const totalMimosGerados = Math.floor(totalCookies / MIMO_COOKIE_THRESHOLD)
  const mimosDisponiveis = Math.max(totalMimosGerados - mimosEntregues, 0)
  const cookiesDesdeUltimoMimoEntregue = Math.max(totalCookies - mimosEntregues * MIMO_COOKIE_THRESHOLD, 0)
  const progressoAtual = cookiesDesdeUltimoMimoEntregue % MIMO_COOKIE_THRESHOLD
  const faltamParaProximo = progressoAtual === 0 ? MIMO_COOKIE_THRESHOLD : MIMO_COOKIE_THRESHOLD - progressoAtual

  return {
    totalMimosGerados,
    mimosEntregues,
    mimosDisponiveis,
    progressoAtual,
    faltamParaProximo,
  }
}
