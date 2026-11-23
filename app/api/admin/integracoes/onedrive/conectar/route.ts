import { documentoJson, rotaFinanceira } from '@/lib/documentos-financeiros-http'
import { iniciarOneDrive } from '@/lib/onedrive-financeiro'
import { gravarCookieOneDrive, sessaoOneDrive } from '@/lib/onedrive-financeiro-http'

export const POST = rotaFinanceira('POST', async (ator, request) => {
  const { config, sessao } = await sessaoOneDrive(ator, request)
  const { state, url } = await iniciarOneDrive(sessao, config)
  return gravarCookieOneDrive(documentoJson({ url }), state)
}, true)
