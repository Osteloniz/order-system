import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { DocumentoFinanceiroErro } from '@/lib/documento-financeiro-arquivo'
import { rotaDocumento } from '@/lib/documentos-financeiros-http'
import { abrirDocumento } from '@/lib/documentos-financeiros'
import { arquivosOneDrive, lerBytesFinanceiros, limiteTransporteFinanceiro } from '@/lib/onedrive-financeiro'

export const GET = rotaDocumento('GET', async (ator, id) => {
  const { stream, nomeOriginal, mimeType, sha256, tamanhoBytes } = await abrirDocumento(ator, id, arquivosOneDrive(ator))
  const bytes = await lerBytesFinanceiros(stream, Math.min(tamanhoBytes, limiteTransporteFinanceiro))
  if (bytes.length !== tamanhoBytes || createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new DocumentoFinanceiroErro('O original foi alterado no OneDrive', 409)
  }
  const nome = encodeURIComponent(nomeOriginal).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))
  return new NextResponse(new Uint8Array(bytes), { headers: {
    'Content-Type': mimeType,
    'Content-Disposition': "attachment; filename*=UTF-8''" + nome,
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  } })
})
