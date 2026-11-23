import { getToken } from 'next-auth/jwt'
import type { NextRequest, NextResponse } from 'next/server'
import { DocumentoFinanceiroErro } from '@/lib/documento-financeiro-arquivo'
import { type AtorDocumento } from '@/lib/documentos-financeiros-http'
import { cookieOneDrive, estadoOneDriveSegundos, exigirOneDrive } from '@/lib/onedrive-financeiro'

export function gravarCookieOneDrive(response: NextResponse, state: string, idade = estadoOneDriveSegundos) {
  response.cookies.set(cookieOneDrive, state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: idade, path: '/api/admin/integracoes/onedrive',
  })
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export async function sessaoOneDrive(ator: AtorDocumento, request: NextRequest) {
  const config = exigirOneDrive()
  if (request.headers.get('origin') !== config.origin) {
    throw new DocumentoFinanceiroErro('Abra o Brookie pelo endereço configurado para a integração', 403)
  }
  const token = await getToken({
    req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: 'next-auth.session-token',
  })
  if (typeof token?.adminSessionId !== 'string' || token.id !== ator.adminUserId || token.tenantId !== ator.tenantId) {
    throw new DocumentoFinanceiroErro('Entre novamente no Brookie para autorizar o OneDrive', 409)
  }
  return { config, sessao: { tenantId: ator.tenantId, adminUserId: ator.adminUserId, sessaoId: token.adminSessionId } }
}
