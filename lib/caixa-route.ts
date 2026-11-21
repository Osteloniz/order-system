import type { NextRequest } from 'next/server'
import { getCaixaActor, type CaixaActor } from '@/lib/caixa-session'
import { caixaHttpError, caixaJson, caixaMutationOrigin } from '@/lib/caixa-http'

export function caixaRoute(
  handler: (request: NextRequest, actor: CaixaActor) => Promise<Response>,
  { mutation = false, admin = false } = {},
) {
  return async (request: NextRequest) => {
    if (mutation && !caixaMutationOrigin(request)) return caixaJson({ error: 'Origem inválida.' }, 403)
    try {
      const actor = await getCaixaActor(mutation)
      if (!actor) return caixaJson({ error: 'Sessão expirada.' }, 401)
      if (admin && actor.role === 'CAIXA') return caixaJson({ error: 'Operação restrita à administração.' }, 403)
      return await handler(request, actor)
    } catch (error) {
      return caixaHttpError(error)
    }
  }
}
