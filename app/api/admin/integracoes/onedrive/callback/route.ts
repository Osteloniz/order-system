import { NextRequest, NextResponse } from 'next/server'
import { configuracaoOneDrive, cookieOneDrive, guardarRetornoOneDrive, regexEstado } from '@/lib/onedrive-financeiro'

export async function GET(request: NextRequest) {
  const config = configuracaoOneDrive()
  const params = request.nextUrl.searchParams
  const state = params.get('state')
  const code = params.get('code')
  const cookie = request.cookies.get(cookieOneDrive)?.value
  const recebido = Boolean(config && request.nextUrl.origin === config.origin && state && state === cookie &&
    regexEstado.test(state) && code && code.length <= 4096 && !params.has('error') &&
    await guardarRetornoOneDrive(config, state, code).catch(() => false))
  const destino = '/api/admin/integracoes/onedrive/retorno?estado=' + (recebido ? 'recebido' : 'falha')
  const response = NextResponse.redirect(new URL(destino, config?.origin ?? request.nextUrl.origin), 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
