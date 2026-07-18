import { NextResponse } from 'next/server'
import { hasActiveAsaasPixKey } from '@/lib/asaas'
import { prisma } from '@/lib/db'
import { loadShadowCommittedQuantityMap } from '@/lib/order-stock'
import { resolvePublicCardAvailability } from '@/lib/payment-gateway'
import { resolveProductOrderMode } from '@/lib/product-availability'
import { getTenantFromCookie } from '@/lib/tenant'

export const runtime = 'nodejs'

function getCategoriaPrioridade(nome: string) {
  const categoria = nome.trim().toLocaleLowerCase('pt-BR')

  if (categoria === 'cookies') return 1
  if (categoria === 'cookies recheados') return 2

  return 99
}

function getDefaultMenuPayload() {
  const cardAvailability = resolvePublicCardAvailability({
    cartaoHabilitado: true,
    cartaoCreditoHabilitado: true,
    cartaoDebitoHabilitado: true,
  })

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
        cartao: cardAvailability.cartao,
        cartaoCredito: cardAvailability.cartaoCredito,
        cartaoDebito: cardAvailability.cartaoDebito,
      },
      pagamentoOnline: {
        gateway: cardAvailability.gateway.gateway,
        cartaoDebitoSuportado: cardAvailability.gateway.cartaoDebitoSuportado,
      },
    },
    hasActiveCoupons: false,
    novidades: [],
    indisponiveis: [],
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

    const [categoriasOrdenadas, estoques, cuponsDisponiveis, shadowCommittedMap] = await Promise.all([
      prisma.categoria.findMany({
        where: { tenantId: tenant.id },
        orderBy: { ordem: 'asc' },
        include: {
          produtos: {
            where: { descontinuado: false, tenantId: tenant.id },
            orderBy: { ordem: 'asc' },
          },
        },
      }),
      prisma.produtoEstoque.findMany({
        where: { tenantId: tenant.id },
        select: { produtoId: true, quantidadeDisponivel: true },
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
      loadShadowCommittedQuantityMap(tenant.id),
    ])
    const estoqueMap = new Map(estoques.map((estoque) => [estoque.produtoId, estoque.quantidadeDisponivel]))
    const encomendaHabilitada = configuracao.checkoutPublicoEntregaEncomenda ?? true

    const categoriasNormalizadas = categoriasOrdenadas.map((categoria) => ({
      ...categoria,
      produtos: categoria.produtos.map((produto) => {
        const estoqueDisponivel = Math.max(0, (estoqueMap.get(produto.id) ?? 0) - (shadowCommittedMap.get(produto.id) ?? 0))
        const statusDisponibilidade = resolveProductOrderMode({
          ativoNoCatalogo: produto.ativo,
          estoqueDisponivel,
          disponivelParaEncomenda: produto.disponivelParaEncomenda,
          encomendaHabilitada,
        })

        return {
          ...produto,
          estoqueDisponivel,
          statusDisponibilidade,
        }
      }),
    }))

    const categoriasComProdutos = categoriasNormalizadas
      .map((categoria) => ({
        ...categoria,
        produtos: categoria.produtos.filter((produto) => produto.statusDisponibilidade !== 'INDISPONIVEL'),
      }))
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
    const novidades = categoriasComProdutos.flatMap((categoria) => categoria.produtos.filter((produto) => produto.novidade))
    const indisponiveis = categoriasNormalizadas
      .flatMap((categoria) => categoria.produtos)
      .filter((produto) => produto.statusDisponibilidade === 'INDISPONIVEL')
    const cardAvailability = resolvePublicCardAvailability({
      cartaoHabilitado: configuracao.checkoutPublicoPagamentoCartao ?? true,
      cartaoCreditoHabilitado: configuracao.checkoutPublicoPagamentoCartaoCredito ?? true,
      cartaoDebitoHabilitado: configuracao.checkoutPublicoPagamentoCartaoDebito ?? true,
    })
    const pixGatewayDisponivel =
      cardAvailability.gateway.gateway === 'ASAAS'
        ? await hasActiveAsaasPixKey()
        : true

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
          pix: (configuracao.checkoutPublicoPagamentoPix ?? true) && pixGatewayDisponivel,
          dinheiro: configuracao.checkoutPublicoPagamentoDinheiro ?? true,
          cartao: cardAvailability.cartao,
          cartaoCredito: cardAvailability.cartaoCredito,
          cartaoDebito: cardAvailability.cartaoDebito,
        },
        pagamentoOnline: {
          gateway: cardAvailability.gateway.gateway,
          cartaoDebitoSuportado: cardAvailability.gateway.cartaoDebitoSuportado,
        },
      },
      hasActiveCoupons,
      novidades,
      indisponiveis,
      categorias: categoriasComProdutos ?? [],
    })
  } catch (error) {
    console.error('[api/menu] Erro:', error)
    return NextResponse.json(getDefaultMenuPayload())
  }
}
