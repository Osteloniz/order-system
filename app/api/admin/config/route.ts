import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/config - Retorna configuracoes
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  let configuracao = await prisma.configuracao.findFirst()
  if (!configuracao) {
    configuracao = await prisma.configuracao.create({
      data: {
        nomeEstabelecimento: 'Estabelecimento',
        enderecoRetirada: 'Endereco nao configurado',
        freteBase: 500,
        freteRaioKm: 3,
        freteKmExcedente: 100,
        estabelecimentoLat: 0,
        estabelecimentoLng: 0
      }
    })
  }

  return NextResponse.json(configuracao)
}

// PUT /api/admin/config - Atualiza configuracoes
export async function PUT(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    let configuracao = await prisma.configuracao.findFirst()

    if (!configuracao) {
      configuracao = await prisma.configuracao.create({
        data: {
          nomeEstabelecimento: body.nomeEstabelecimento ?? 'Estabelecimento',
          enderecoRetirada: body.enderecoRetirada ?? 'Endereco nao configurado',
          freteBase: body.freteBase !== undefined ? Math.round(body.freteBase) : 500,
          freteRaioKm: body.freteRaioKm !== undefined ? Number(body.freteRaioKm) : 3,
          freteKmExcedente: body.freteKmExcedente !== undefined ? Math.round(body.freteKmExcedente) : 100,
          estabelecimentoLat: body.estabelecimentoLat !== undefined ? Number(body.estabelecimentoLat) : 0,
          estabelecimentoLng: body.estabelecimentoLng !== undefined ? Number(body.estabelecimentoLng) : 0
        }
      })
      return NextResponse.json(configuracao)
    }

    const configuracaoAtualizada = await prisma.configuracao.update({
      where: { id: configuracao.id },
      data: {
        freteBase: body.freteBase !== undefined ? Math.round(body.freteBase) : configuracao.freteBase,
        freteRaioKm: body.freteRaioKm !== undefined ? Number(body.freteRaioKm) : configuracao.freteRaioKm,
        freteKmExcedente: body.freteKmExcedente !== undefined ? Math.round(body.freteKmExcedente) : configuracao.freteKmExcedente,
        enderecoRetirada: body.enderecoRetirada ?? configuracao.enderecoRetirada,
        nomeEstabelecimento: body.nomeEstabelecimento ?? configuracao.nomeEstabelecimento,
        estabelecimentoLat: body.estabelecimentoLat !== undefined ? Number(body.estabelecimentoLat) : configuracao.estabelecimentoLat,
        estabelecimentoLng: body.estabelecimentoLng !== undefined ? Number(body.estabelecimentoLng) : configuracao.estabelecimentoLng
      }
    })

    console.log('[v0] Configuracoes atualizadas')

    return NextResponse.json(configuracaoAtualizada)
  } catch (error) {
    console.error('[v0] Erro ao atualizar configuracoes:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar configuracoes' },
      { status: 500 }
    )
  }
}
