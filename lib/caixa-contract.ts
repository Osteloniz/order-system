import { z } from 'zod'

export const meiosCaixa = ['PIX', 'CREDITO', 'DEBITO', 'DINHEIRO'] as const
export type MeioCaixa = typeof meiosCaixa[number]
export const meioCaixaLabel: Record<MeioCaixa, string> = {
  PIX: 'Pix', CREDITO: 'Crédito', DEBITO: 'Débito', DINHEIRO: 'Dinheiro',
}

const item = z.object({ produtoId: z.string().uuid(), quantidade: z.number().int().min(1).max(999) }).strict()
export const cestaCaixa = z.array(item).min(1).max(100)
export type ItemCaixa = z.infer<typeof item>

const tentativa = z.string().uuid()
const meio = z.enum(meiosCaixa)
const pedidoId = z.string().uuid()
const motivo = z.string().trim().min(3).max(300)

export const vendaCaixa = z.object({
  itens: cestaCaixa, clienteId: z.string().uuid().nullable(), pago: z.boolean(), meio,
  cotacao: z.string().regex(/^[a-f0-9]{64}$/), tentativa,
}).strict()

export const operacaoCaixa = z.discriminatedUnion('operacao', [
  z.object({ operacao: z.literal('BAIXA'), pedidoId, tentativa, meio }).strict(),
  z.object({ operacao: z.literal('CORRECAO'), pedidoId, tentativa, meio, motivo,
    versao: z.string().uuid(), taxa: z.number().int().nonnegative().optional() }).strict(),
  z.object({ operacao: z.literal('ESTORNO'), pedidoId, tentativa, motivo,
    versao: z.string().uuid(), reabrir: z.boolean() }).strict(),
  z.object({ operacao: z.literal('CANCELAMENTO'), pedidoId, tentativa, motivo }).strict(),
  z.object({ operacao: z.literal('DEVOLUCAO'), pedidoId, tentativa, motivo,
    aptoParaVenda: z.literal(true), itens: cestaCaixa }).strict(),
])
export type VendaCaixa = z.infer<typeof vendaCaixa>
export type OperacaoCaixa = z.infer<typeof operacaoCaixa>

export function agregarItensCaixa(itens: ItemCaixa[]): ItemCaixa[] {
  const totais = new Map<string, number>()
  for (const item of itens) totais.set(item.produtoId, (totais.get(item.produtoId) ?? 0) + item.quantidade)
  return Array.from(totais, ([produtoId, quantidade]) => ({ produtoId, quantidade }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId))
}

export function expressSalesEnabled() {
  return process.env.BROOKIE_CAIXA_NOVAS_VENDAS === 'true' && process.env.VERCEL_ENV !== 'production'
}
