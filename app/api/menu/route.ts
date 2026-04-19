import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

function getCategoriaPrioridade(nome: string) {
  const categoria = nome.trim().toLocaleLowerCase('pt-BR')

  if (categoria === 'cookies') return 1
  if (categoria === 'cookies recheados') return 2

  return 99
}

// GET /api/menu - Retorna categorias + produtos ativos
export async function GET() {
  try {
    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json(
        {
          estabelecimento: 'Brookie Pregiato',
          enderecoRetirada: 'Endereço de Retirada',
          freteBase: 500,
          freteRaioKm: 3,
          freteKmExcedente: 100,
          estabelecimentoLat: 0,
          estabelecimentoLng: 0,
          isOpen: true,
          categorias: []
        },
        { status: 400 }
      )
    }

    let configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: tenant.id }
    })
    if (!configuracao) {
      configuracao = await prisma.configuracao.create({
        data: {
          nomeEstabelecimento: 'Estabelecimento',
          enderecoRetirada: 'Endereco nao configurado',
          freteBase: 500,
          freteRaioKm: 3,
          freteKmExcedente: 100,
          estabelecimentoLat: 0,
          estabelecimentoLng: 0,
          tenantId: tenant.id
        }
      })
    }

    // Busca categorias com produtos ativos ordenados.
    const categoriasOrdenadas = await prisma.categoria.findMany({
      where: { tenantId: tenant.id },
      orderBy: { ordem: 'asc' },
      include: {
        produtos: {
          where: { ativo: true, tenantId: tenant.id },
          orderBy: { ordem: 'asc' }
        }
      }
    })

    const categoriasComProdutos = categoriasOrdenadas
      .filter(cat => cat.produtos.length > 0)
      .sort((a, b) => {
        const prioridadeA = getCategoriaPrioridade(a.nome)
        const prioridadeB = getCategoriaPrioridade(b.nome)

        if (prioridadeA !== prioridadeB) {
          return prioridadeA - prioridadeB
        }

        return a.ordem - b.ordem
      })

    return NextResponse.json({
      estabelecimento: configuracao?.nomeEstabelecimento ?? 'Brookie Pregiato',
      enderecoRetirada: configuracao?.enderecoRetirada ?? 'Endereço de Retirada',
      freteBase: configuracao?.freteBase ?? 500,
      freteRaioKm: configuracao?.freteRaioKm ?? 3,
      freteKmExcedente: configuracao?.freteKmExcedente ?? 100,
      estabelecimentoLat: configuracao?.estabelecimentoLat ?? 0,
      estabelecimentoLng: configuracao?.estabelecimentoLng ?? 0,
      isOpen: tenant.isOpen,
      categorias: categoriasComProdutos ?? []
    })
  } catch (error) {
    console.error('[api/menu] Erro:', error)
    return NextResponse.json({
      estabelecimento: 'Brookie Pregiato',
      enderecoRetirada: 'Endereço de Retirada',
      freteBase: 500,
      freteRaioKm: 3,
      freteKmExcedente: 100,
      estabelecimentoLat: 0,
      estabelecimentoLng: 0,
      isOpen: true,
      categorias: []
    })
  }
}
