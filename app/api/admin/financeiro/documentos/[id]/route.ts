import { documentoJson, rotaDocumento } from '@/lib/documentos-financeiros-http'
import { consultarDocumento } from '@/lib/documentos-financeiros'

export const GET = rotaDocumento('GET', async (ator, id) => documentoJson(await consultarDocumento(ator, id)))
