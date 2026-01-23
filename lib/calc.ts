// Funções de cálculo de valores

/**
 * Calcula o total de um item (preço * quantidade)
 */
export function calcularTotalItem(precoUnitario: number, quantidade: number): number {
  return precoUnitario * quantidade
}

/**
 * Calcula o subtotal (soma de todos os itens)
 */
export function calcularSubtotal(itens: { totalItem: number }[]): number {
  return itens.reduce((acc, item) => acc + item.totalItem, 0)
}

/**
 * Calcula o total (subtotal + frete)
 */
export function calcularTotal(subtotal: number, frete: number): number {
  return subtotal + frete
}

/**
 * Formata valor em centavos para moeda brasileira
 */
export function formatarMoeda(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(centavos / 100)
}

/**
 * Formata telefone brasileiro
 */
export function formatarTelefone(telefone: string): string {
  const numeros = telefone.replace(/\D/g, '')
  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  }
  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`
  }
  return telefone
}

/**
 * Formata data/hora
 */
export function formatarDataHora(isoString: string): string {
  const data = new Date(isoString)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data)
}

/**
 * Formata apenas hora
 */
export function formatarHora(isoString: string): string {
  const data = new Date(isoString)
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(data)
}
