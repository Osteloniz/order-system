import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { configuracao } from '@/lib/mock-db'

async function verificarAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  return session?.value === 'authenticated'
}

// GET /api/admin/config - Retorna configurações
export async function GET() {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  return NextResponse.json(configuracao)
}

// PUT /api/admin/config - Atualiza configurações
export async function PUT(request: NextRequest) {
  if (!await verificarAuth()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()

    if (body.freteFixo !== undefined) {
      configuracao.freteFixo = Math.round(body.freteFixo)
    }
    if (body.enderecoRetirada) {
      configuracao.enderecoRetirada = body.enderecoRetirada
    }
    if (body.nomeEstabelecimento) {
      configuracao.nomeEstabelecimento = body.nomeEstabelecimento
    }

    console.log('[v0] Configurações atualizadas')

    return NextResponse.json(configuracao)
  } catch (error) {
    console.error('[v0] Erro ao atualizar configurações:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar configurações' },
      { status: 500 }
    )
  }
}
