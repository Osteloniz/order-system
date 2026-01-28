import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

// GET /api/menu - Retorna categorias + produtos ativos
export async function GET() {
  const tenant = await getTenantFromCookie()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nao definido' }, { status: 400 })
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

  const categoriasComProdutos = categoriasOrdenadas.filter(cat => cat.produtos.length > 0)

  return NextResponse.json({
    estabelecimento: configuracao?.nomeEstabelecimento ?? 'Estabelecimento',
    enderecoRetirada: configuracao?.enderecoRetirada ?? 'Endereco nao configurado',
    freteBase: configuracao?.freteBase ?? 500,
    freteRaioKm: configuracao?.freteRaioKm ?? 3,
    freteKmExcedente: configuracao?.freteKmExcedente ?? 100,
    estabelecimentoLat: configuracao?.estabelecimentoLat ?? 0,
    estabelecimentoLng: configuracao?.estabelecimentoLng ?? 0,
    isOpen: tenant.isOpen,
    categorias: categoriasComProdutos
  })
}
