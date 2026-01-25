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
 * Calcula distancia em km entre 2 coordenadas (Haversine)
 */
export function calcularDistanciaKm(
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number }
): number {
  const toRad = (valor: number) => (valor * Math.PI) / 180
  const R = 6371 // raio medio da terra em km
  const dLat = toRad(destino.lat - origem.lat)
  const dLng = toRad(destino.lng - origem.lng)
  const lat1 = toRad(origem.lat)
  const lat2 = toRad(destino.lat)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calcula frete baseado na distancia e regras do negocio.
 */
export function calcularFretePorDistancia(params: {
  distanciaKm: number
  freteBase: number
  freteRaioKm: number
  freteKmExcedente: number
}): number {
  const distanciaValida = Math.max(0, params.distanciaKm)
  if (distanciaValida <= params.freteRaioKm) {
    return params.freteBase
  }
  const excedente = Math.ceil(distanciaValida - params.freteRaioKm)
  return params.freteBase + excedente * params.freteKmExcedente
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
