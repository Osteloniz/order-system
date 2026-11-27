import { documentoJson, lerJsonDocumento, rotaDocumento } from '@/lib/documentos-financeiros-http'
import { cancelarDocumento, cancelarDocumentoSchema } from '@/lib/documentos-financeiros'

export const POST = rotaDocumento('POST', async (ator, id, request) => {
  const body = cancelarDocumentoSchema.parse(await lerJsonDocumento(request))
  return documentoJson(await cancelarDocumento(ator, id, body))
})
