import { NextRequest, NextResponse } from 'next/server'
import { caminhoFinanceiro } from '@/lib/onedrive-financeiro'

export function GET(request: NextRequest) {
  const recebido = request.nextUrl.searchParams.get('estado') === 'recebido'
  const titulo = recebido ? 'Retorno do OneDrive recebido' : 'Autorização indisponível'
  // A navegação iniciada neste documento preserva o cookie Strict do admin.
  const href = caminhoFinanceiro + (recebido ? '?onedrive=retorno' : '?onedrive=falha')
  return new NextResponse(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + titulo + '</title><main><h1>' + titulo + '</h1><p><a href="' + href + '">' +
    'Voltar ao Brookie</a></p></main></html>',
    { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    } },
  )
}
