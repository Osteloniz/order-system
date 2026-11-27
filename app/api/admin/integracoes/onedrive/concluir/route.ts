import { documentoJson, rotaFinanceira } from '@/lib/documentos-financeiros-http'
import { concluirOneDrive, cookieOneDrive, regexEstado } from '@/lib/onedrive-financeiro'
import { gravarCookieOneDrive, sessaoOneDrive } from '@/lib/onedrive-financeiro-http'

export const POST = rotaFinanceira('POST', async (ator, request) => {
  const { config, sessao } = await sessaoOneDrive(ator, request)
  const state = request.cookies.get(cookieOneDrive)?.value
  if (!state || !regexEstado.test(state)) return documentoJson({ error: 'Inicie uma nova conexão' }, 409)
  await concluirOneDrive(sessao, config, state)
  return gravarCookieOneDrive(documentoJson({ ok: true }), '', 0)
}, true)
