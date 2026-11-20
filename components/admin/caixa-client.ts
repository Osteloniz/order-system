import type { MeioCaixa } from '@/lib/caixa-contract'

export type ProdutoCaixa = { id: string; nome: string; categoria: string; preco: number; saldo: number }
export type LinhaCaixa = { produtoId: string; nome: string; preco: number; quantidade: number }
export type ClienteCaixa = { id: string; nome: string; telefone: string | null }
export type PendenciaCaixa = { id: string; numero: string; clienteNome: string; telefoneFinal?: string; total: number; meio: MeioCaixa }
export type CotacaoCaixa = { total: number; cotacao: string; linhas: {
  produtoId: string; nomeProdutoSnapshot: string; precoUnitarioSnapshot: number; quantidade: number
}[] }

export class CaixaRequestError extends Error {
  constructor(readonly status: number, readonly body: { error?: string; novaCotacao?: CotacaoCaixa; produtoId?: string }) {
    super(body.error ?? 'O servidor não confirmou a operação.')
  }
}

export async function requestCaixa<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/caixa/' + path, {
    method, cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const payload = await response.json()
  if (!response.ok) throw new CaixaRequestError(response.status, payload)
  return payload
}

export async function hashCotacao(linhas: LinhaCaixa[]) {
  const ordenadas = [...linhas].sort((a, b) => a.produtoId.localeCompare(b.produtoId))
  const snapshot = JSON.stringify(ordenadas.map((item) => [item.produtoId, item.quantidade, item.preco]))
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
