import { documentoJson, lerJsonDocumento, rotaDocumento } from '@/lib/documentos-financeiros-http'
import { confirmarDocumento, confirmarDocumentoSchema } from '@/lib/documentos-financeiros'

export const POST = rotaDocumento('POST', async (ator, id, request) => {
  const body = confirmarDocumentoSchema.parse(await lerJsonDocumento(request))
  const resultado = await confirmarDocumento(ator, id, body)
  return documentoJson(resultado, 'duplicidades' in resultado ? 409 : 200)
})
