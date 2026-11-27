import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAdminSession } from '@/lib/auth-helpers'
import { caixaMutationOrigin as origemPermitida } from '@/lib/caixa-http'
import { DocumentoFinanceiroErro } from '@/lib/documento-financeiro-arquivo'

type Contexto = { params: Promise<{ id: string }> }
export type AtorDocumento = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function documentoJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function rotaDocumento(
  metodo: 'GET' | 'PATCH' | 'POST',
  executar: (ator: AtorDocumento, id: string, request: NextRequest) => Promise<NextResponse>,
) {
  return async (request: NextRequest, contexto: Contexto) => rotaFinanceira(metodo, async (ator) => {
    const { id } = await contexto.params
    if (!uuid.test(id)) return documentoJson({ error: 'Documento não encontrado' }, 404)
    return await executar(ator, id, request)
  })(request)
}

export function rotaFinanceira(
  metodo: 'GET' | 'PATCH' | 'POST' | 'DELETE',
  executar: (ator: AtorDocumento, request: NextRequest) => Promise<NextResponse>,
  somenteMaster = false,
) {
  return async (request: NextRequest) => {
    try {
      const ator = await getAdminSession()
      if (!ator) return documentoJson({ error: 'Não autorizado' }, 401)
      if (ator.user.role !== 'MASTER' && (somenteMaster || ator.user.role !== 'ADMIN')) {
        return documentoJson({ error: 'Acesso negado' }, 403)
      }
      if (metodo !== 'GET' && !origemPermitida(request)) {
        return documentoJson({ error: 'Origem não permitida' }, 403)
      }
      return await executar(ator, request)
    } catch (erro) {
      if (erro instanceof DocumentoFinanceiroErro) return documentoJson({ error: erro.message }, erro.status)
      if (erro instanceof ZodError || erro instanceof SyntaxError) {
        return documentoJson({ error: 'Dados inválidos' }, 400)
      }
      return documentoJson({ error: 'Não foi possível concluir a operação do documento' }, 500)
    }
  }
}

export async function lerJsonDocumento(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' || !request.body) {
    throw new DocumentoFinanceiroErro('Envie dados JSON', 415)
  }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let json = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 16_384) {
        await reader.cancel()
        throw new DocumentoFinanceiroErro('Dados acima do limite', 413)
      }
      json += decoder.decode(value, { stream: true })
    }
    return JSON.parse(json + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}
