import { z } from 'zod'
import { DocumentoFinanceiroErro } from '@/lib/documento-financeiro-arquivo'
import { documentoJson, rotaFinanceira } from '@/lib/documentos-financeiros-http'
import { capturarDocumento, listarDocumentos } from '@/lib/documentos-financeiros'
import { arquivosOneDrive, exigirOneDrive, lerBytesFinanceiros, limiteTransporteFinanceiro } from '@/lib/onedrive-financeiro'

const upload = z.object({ id: z.string().uuid(), nome: z.string().min(1).max(255), mime: z.string().max(64) })

export const maxDuration = 60
export const GET = rotaFinanceira('GET', async (ator) => documentoJson(await listarDocumentos(ator)))

export const POST = rotaFinanceira('POST', async (ator, request) => {
  exigirOneDrive()
  const encoded = request.headers.get('x-nome-arquivo') ?? ''
  let nome: string
  try {
    nome = decodeURIComponent(encoded)
  } catch {
    throw new DocumentoFinanceiroErro('Nome de arquivo inválido', 400)
  }
  const mime = request.headers.get('content-type')?.split(';')[0] ?? ''
  const metadata = upload.parse({
    id: request.headers.get('x-documento-id'), nome,
    mime: mime === 'application/octet-stream' ? '' : mime,
  })
  if (!request.body) throw new DocumentoFinanceiroErro('Selecione um arquivo', 400)
  if (Number(request.headers.get('content-length')) > limiteTransporteFinanceiro) {
    throw new DocumentoFinanceiroErro('O limite de HML é 4 MiB por documento', 413)
  }
  const bytes = await lerBytesFinanceiros(request.body, limiteTransporteFinanceiro)
  return documentoJson(await capturarDocumento(ator, { ...metadata, bytes }, arquivosOneDrive(ator)), 201)
})
