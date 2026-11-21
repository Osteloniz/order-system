import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getPasswordUtf8ByteLength, normalizeAdminUsername } from '@/lib/admin-credential-policy'
import { hashIpAddress, verifyPassword } from '@/lib/auth-security'
import { isPersistentlyAuthBlocked } from '@/lib/auth-throttle'
import { rateLimitByIdentifier, rateLimitByIp } from '@/lib/rateLimit'
import { endCaixaSession, getCaixaActor, newCaixaSession } from '@/lib/caixa-session'
import { caixaHttpError, caixaJson, caixaMutationOrigin } from '@/lib/caixa-http'

const schema = z.object({
  tenant: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(80),
  login: z.string().trim().min(3).max(40),
  senha: z.string().min(1).refine((value) => getPasswordUtf8ByteLength(value) <= 72),
}).strict()
const dummyHash = '$2a$12$Gz0ovJNY3tkQPVbTI5NLzOStyTtv/kCkFOP6TM3uKmPh1jkpkSdhu'

function redirecionarLogin(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  if (!caixaMutationOrigin(request)) return caixaJson({ error: 'Origem inválida.' }, 403)
  const formulario = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')
  try {
    const dados = formulario ? Object.fromEntries(await request.formData()) : await request.json()
    const { tenant, login, senha } = schema.parse(dados)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIpAddress(ip)
    const username = normalizeAdminUsername(login)
    const identifier = hashIpAddress(`caixa:${tenant}:${username}`)
    const user = await prisma.adminUser.findFirst({
      where: { tenant: { slug: tenant }, username, role: 'CAIXA' },
    })
    const blocked = !rateLimitByIp(ip).allowed || !rateLimitByIdentifier(ip, identifier).allowed
      || await isPersistentlyAuthBlocked({ ipHash, identifier })
    const valid = !blocked && await verifyPassword(senha, user?.passwordHash ?? dummyHash)
    if (!valid || !user?.ativo) {
      await prisma.authAuditLog.create({
        data: { action: 'LOGIN_FAILURE', tenantId: user?.tenantId, adminUserId: user?.id, ipHash, identifier,
          metadata: { role: 'CAIXA', reason: blocked ? 'rate_limited' : 'invalid_credentials' } },
      })
      if (formulario) return redirecionarLogin(blocked ? '/caixa/login?erro=limite' : '/caixa/login?erro=credenciais')
      return caixaJson({ error: blocked ? 'Muitas tentativas. Aguarde para tentar novamente.' : 'Credenciais inválidas.' },
        blocked ? 429 : 401)
    }

    await endCaixaSession()
    await newCaixaSession(user, ipHash, identifier)
    return formulario ? redirecionarLogin('/caixa') : caixaJson({ ok: true })
  } catch (error) {
    const response = caixaHttpError(error)
    if (!formulario) return response
    return redirecionarLogin(response.status < 500 ? '/caixa/login?erro=credenciais' : '/caixa/login?erro=indisponivel')
  }
}

export async function DELETE(request: NextRequest) {
  if (!caixaMutationOrigin(request)) return caixaJson({ error: 'Origem inválida.' }, 403)
  try {
    await endCaixaSession()
    return caixaJson({ ok: true })
  } catch (error) {
    return caixaHttpError(error)
  }
}

export async function PATCH(request: NextRequest) {
  if (!caixaMutationOrigin(request)) return caixaJson({ error: 'Origem inválida.' }, 403)
  const actor = await getCaixaActor(true)
  return actor ? caixaJson({ ok: true }) : caixaJson({ error: 'Sessão expirada.' }, 401)
}
