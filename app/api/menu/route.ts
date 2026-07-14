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

function getDefaultMenuPayload() {
  return {
    estabelecimento: 'Brookie Pregiato',
    enderecoRetirada: 'Endereco de Retirada',
    freteBase: 500,
    freteRaioKm: 3,
    freteKmExcedente: 100,
    estabelecimentoLat: 0,
    estabelecimentoLng: 0,
    isOpen: true,
    checkoutPublico: {
      entregas: {
        reservaPaulistano: true,
        retirada: true,
        encomenda: true,
      },
      encomenda: {
        modo: 'CLIENTE_DEFINE' as const,
        dataFixa: null,
      },
      pagamentos: {
        pix: true,
        dinheiro: true,
        cartao: true,
        cartaoCredito: true,
        cartaoDebito: true,
      },
    },
    hasActiveCoupons: false,
    categorias: [],
  }
}

// GET /api/menu - Retorna categorias + produtos ativos
export async function GET() {
  try {
    const tenant = await getTenantFromCookie()
    if (!tenant) {
      return NextResponse.json(getDefaultMenuPayload(), { status: 400 })
    }

    let configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: tenant.id },
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
          checkoutPublicoEntregaReservaPaulistano: true,
          checkoutPublicoEntregaRetirada: true,
          checkoutPublicoEntregaEncomenda: true,
          checkoutPublicoEncomendaModo: 'CLIENTE_DEFINE',
          checkoutPublicoEncomendaDataFixa: null,
          checkoutPublicoPagamentoPix: true,
          checkoutPublicoPagamentoDinheiro: true,
          checkoutPublicoPagamentoCartao: true,
          checkoutPublicoPagamentoCartaoCredito: true,
          checkoutPublicoPagamentoCartaoDebito: true,
          tenantId: tenant.id,
        },
      })
    }

    const [categoriasOrdenadas, cuponsDisponiveis] = await Promise.all([
      prisma.categoria.findMany({
      where: { tenantId: tenant.id },
      orderBy: { ordem: 'asc' },
      include: {
        produtos: {
          where: { ativo: true, tenantId: tenant.id },
          orderBy: { ordem: 'asc' },
        },
      },
      }),
      prisma.cupom.findMany({
        where: {
          tenantId: tenant.id,
          ativo: true,
          expiraEm: { gt: new Date() },
        },
        select: {
          id: true,
          usos: true,
          maxUsos: true,
        },
      }),
    ])

    const categoriasComProdutos = categoriasOrdenadas
      .filter((cat) => cat.produtos.length > 0)
      .sort((a, b) => {
        const prioridadeA = getCategoriaPrioridade(a.nome)
        const prioridadeB = getCategoriaPrioridade(b.nome)

        if (prioridadeA !== prioridadeB) {
          return prioridadeA - prioridadeB
        }

        return a.ordem - b.ordem
      })

    const hasActiveCoupons = cuponsDisponiveis.some((cupom) => cupom.usos < cupom.maxUsos)

    return NextResponse.json({
      estabelecimento: configuracao.nomeEstabelecimento || 'Brookie Pregiato',
      enderecoRetirada: configuracao.enderecoRetirada || 'Endereco de Retirada',
      freteBase: configuracao.freteBase ?? 500,
      freteRaioKm: configuracao.freteRaioKm ?? 3,
      freteKmExcedente: configuracao.freteKmExcedente ?? 100,
      estabelecimentoLat: configuracao.estabelecimentoLat ?? 0,
      estabelecimentoLng: configuracao.estabelecimentoLng ?? 0,
      isOpen: tenant.isOpen,
      checkoutPublico: {
        entregas: {
          reservaPaulistano: configuracao.checkoutPublicoEntregaReservaPaulistano ?? true,
          retirada: configuracao.checkoutPublicoEntregaRetirada ?? true,
          encomenda: configuracao.checkoutPublicoEntregaEncomenda ?? true,
        },
        encomenda: {
          modo: configuracao.checkoutPublicoEncomendaModo ?? 'CLIENTE_DEFINE',
          dataFixa: configuracao.checkoutPublicoEncomendaDataFixa ?? null,
        },
        pagamentos: {
          pix: configuracao.checkoutPublicoPagamentoPix ?? true,
          dinheiro: configuracao.checkoutPublicoPagamentoDinheiro ?? true,
          cartao: configuracao.checkoutPublicoPagamentoCartao ?? true,
          cartaoCredito: configuracao.checkoutPublicoPagamentoCartaoCredito ?? true,
          cartaoDebito: configuracao.checkoutPublicoPagamentoCartaoDebito ?? true,
        },
      },
      hasActiveCoupons,
      categorias: categoriasComProdutos ?? [],
    })
  } catch (error) {
    console.error('[api/menu] Erro:', error)
    return NextResponse.json(getDefaultMenuPayload())
  }
}
