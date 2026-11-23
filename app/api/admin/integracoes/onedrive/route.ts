import { documentoJson, rotaFinanceira } from '@/lib/documentos-financeiros-http'
import { desconectarOneDrive, estadoOneDrive } from '@/lib/onedrive-financeiro'
import { gravarCookieOneDrive } from '@/lib/onedrive-financeiro-http'

export const GET = rotaFinanceira('GET', async (ator) => documentoJson({
  estado: await estadoOneDrive(ator.tenantId), gerenciar: ator.user.role === 'MASTER',
}))

export const DELETE = rotaFinanceira('DELETE', async (ator) => {
  await desconectarOneDrive(ator)
  return gravarCookieOneDrive(documentoJson({ ok: true }), '', 0)
}, true)
