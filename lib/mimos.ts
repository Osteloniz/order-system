export const MIMO_COOKIE_THRESHOLD = 14
export const MIMO_PRODUTO_NOME_PADRAO = 'Cookie Tradicional'
export const MIMO_LOG_ORIGEM = 'MIMO_FIDELIDADE'

type MimoLogMetadata = {
  origem: typeof MIMO_LOG_ORIGEM
  clienteId?: string
  clienteNome?: string
  produtoMimoId?: string
  produtoMimoNome?: string
  valorReferencial?: number
  quantidadeMimo?: number
}

function normalizeNome(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .trim()
    .toLowerCase()
}

export function isProdutoMimoNome(nome?: string | null) {
  if (!nome?.trim()) return false

  const normalized = normalizeNome(nome)
  if (normalized === normalizeNome(MIMO_PRODUTO_NOME_PADRAO)) return true

  return normalized.includes('cookie') && normalized.includes('tradicional')
}

export function getMimoLogMetadata(value: unknown): MimoLogMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const origem = 'origem' in value ? value.origem : undefined
  if (origem !== MIMO_LOG_ORIGEM) return null

  const metadata = value as Record<string, unknown>
  return {
    origem: MIMO_LOG_ORIGEM,
    clienteId: typeof metadata.clienteId === 'string' ? metadata.clienteId : undefined,
    clienteNome: typeof metadata.clienteNome === 'string' ? metadata.clienteNome : undefined,
    produtoMimoId: typeof metadata.produtoMimoId === 'string' ? metadata.produtoMimoId : undefined,
    produtoMimoNome: typeof metadata.produtoMimoNome === 'string' ? metadata.produtoMimoNome : undefined,
    valorReferencial: typeof metadata.valorReferencial === 'number' ? metadata.valorReferencial : undefined,
    quantidadeMimo: typeof metadata.quantidadeMimo === 'number' ? metadata.quantidadeMimo : undefined,
  }
}
