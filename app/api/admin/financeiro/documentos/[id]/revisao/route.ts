import { documentoJson, lerJsonDocumento, rotaDocumento } from '@/lib/documentos-financeiros-http'
import { salvarRevisaoDocumento, salvarRevisaoSchema } from '@/lib/documentos-financeiros'

export const PATCH = rotaDocumento('PATCH', async (ator, id, request) => {
  const body = salvarRevisaoSchema.parse(await lerJsonDocumento(request))
  return documentoJson(await salvarRevisaoDocumento(ator, id, body))
})
