import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { CaixaError } from '@/lib/caixa-error'

export function caixaJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function caixaMutationOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (origin === request.nextUrl.origin) return true
  const configured = process.env.APP_URL || process.env.NEXTAUTH_URL
  try {
    return !!configured && new URL(configured).origin === origin
  } catch {
    return false
  }
}

export function caixaHttpError(error: unknown) {
  if (error instanceof CaixaError) return caixaJson({ error: error.message, ...error.details }, error.status)
  if (error instanceof ZodError || error instanceof SyntaxError) return caixaJson({ error: 'Dados inválidos.' }, 400)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return caixaJson({ error: 'O cadastro ou a tentativa já existe. Atualize os dados antes de continuar.' }, 409)
  }
  console.error('Falha no Caixa', error instanceof Error ? error.name : 'Erro desconhecido')
  return caixaJson({ error: 'Não foi possível confirmar a operação. Consulte com a mesma tentativa.' }, 500)
}
