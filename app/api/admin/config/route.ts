import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { appLogger } from '@/lib/app-logger'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'
import { hydrateConfigWithMessageDefaults } from '@/lib/message-templates'

export const runtime = 'nodejs'

function formatConfigSaveError(error: unknown) {
  const baseMessage = error instanceof Error ? error.message : 'Erro interno ao atualizar configuracoes'
  const restartHint = /Unknown arg|Unknown field|P2022|P6001|prisma:\/\//i.test(baseMessage)
    ? ' Reinicie o servidor dev e gere novamente o Prisma Client apos aplicar migrations.'
    : ''

  if (process.env.NODE_ENV !== 'production') {
    return `${baseMessage}${restartHint}`
  }

  return 'Erro ao atualizar configuracoes'
}

function formatConfigLoadError(error: unknown) {
  const baseMessage = error instanceof Error ? error.message : 'Erro ao carregar configuracoes.'
  const restartHint = /Unknown arg|Unknown field|P2022|P6001|prisma:\/\//i.test(baseMessage)
    ? ' Reinicie o servidor dev e gere novamente o Prisma Client apos aplicar migrations.'
    : ''

  if (process.env.NODE_ENV !== 'production') {
    return `${baseMessage}${restartHint}`
  }

  return 'Erro ao carregar configuracoes. Se houve deploy recente, confira se a migration foi aplicada no banco.'
}

const configSchema = z.object({
  nomeEstabelecimento: z.string().trim().min(2).max(100).optional(),
  enderecoRetirada: z.string().trim().min(2).max(200).optional(),
  freteBase: z.number().finite().min(0).max(100_000).optional(),
  freteRaioKm: z.number().finite().min(0).max(100).optional(),
  freteKmExcedente: z.number().finite().min(0).max(100_000).optional(),
  estabelecimentoLat: z.number().finite().min(-90).max(90).optional(),
  estabelecimentoLng: z.number().finite().min(-180).max(180).optional(),
  envioAutomaticoWhatsappStatus: z.boolean().optional(),
  padraoNovoPedidoEntrega: z.enum(['RESERVA_PAULISTANO', 'RETIRADA', 'ENCOMENDA']).optional(),
  padraoNovoPedidoPagamento: z.enum(['PIX', 'DINHEIRO', 'CARTAO']).optional(),
  padraoNovoPedidoTipoCartao: z.enum(['CREDITO', 'DEBITO']).nullable().optional(),
  padraoNovoPedidoDescontosExpandidos: z.boolean().optional(),
  padraoNovoPedidoObservacoesExpandidas: z.boolean().optional(),
  padraoNovoPedidoResponsavelExpandido: z.boolean().optional(),
  mensagemStatusAceito: z.string().trim().min(1).max(4000).optional(),
  mensagemStatusPreparacao: z.string().trim().min(1).max(4000).optional(),
  mensagemStatusEntregue: z.string().trim().min(1).max(4000).optional()
}).strict().superRefine((data, ctx) => {
  if (data.padraoNovoPedidoPagamento === 'CARTAO' && !data.padraoNovoPedidoTipoCartao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['padraoNovoPedidoTipoCartao'],
      message: 'Tipo do cartao obrigatorio quando o padrao de pagamento for cartao',
    })
  }
  if (data.padraoNovoPedidoPagamento && data.padraoNovoPedidoPagamento !== 'CARTAO' && data.padraoNovoPedidoTipoCartao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['padraoNovoPedidoTipoCartao'],
      message: 'Tipo do cartao so deve ser informado quando o padrao for cartao',
    })
  }
})

// GET /api/admin/config - Retorna configuracoes
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    let configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: admin.tenantId }
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
          envioAutomaticoWhatsappStatus: true,
          padraoNovoPedidoEntrega: 'RESERVA_PAULISTANO',
          padraoNovoPedidoPagamento: 'DINHEIRO',
          padraoNovoPedidoTipoCartao: null,
          padraoNovoPedidoDescontosExpandidos: false,
          padraoNovoPedidoObservacoesExpandidas: false,
          padraoNovoPedidoResponsavelExpandido: false,
          tenantId: admin.tenantId
        }
      })
    }

    return NextResponse.json(hydrateConfigWithMessageDefaults(configuracao))
  } catch (error) {
    console.error('[v0] Erro ao carregar configuracoes:', error)
    return NextResponse.json(
      { error: formatConfigLoadError(error) },
      { status: 500 }
    )
  }
}

// PUT /api/admin/config - Atualiza configuracoes
export async function PUT(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = configSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const body = parsed.data
    let configuracao = await prisma.configuracao.findFirst({
      where: { tenantId: admin.tenantId }
    })

    if (!configuracao) {
      configuracao = await prisma.configuracao.create({
        data: {
          nomeEstabelecimento: body.nomeEstabelecimento ?? 'Estabelecimento',
          enderecoRetirada: body.enderecoRetirada ?? 'Endereco nao configurado',
          freteBase: body.freteBase !== undefined ? Math.round(body.freteBase) : 500,
          freteRaioKm: body.freteRaioKm ?? 3,
          freteKmExcedente: body.freteKmExcedente !== undefined ? Math.round(body.freteKmExcedente) : 100,
          estabelecimentoLat: body.estabelecimentoLat ?? 0,
          estabelecimentoLng: body.estabelecimentoLng ?? 0,
          envioAutomaticoWhatsappStatus: body.envioAutomaticoWhatsappStatus ?? true,
          padraoNovoPedidoEntrega: body.padraoNovoPedidoEntrega ?? 'RESERVA_PAULISTANO',
          padraoNovoPedidoPagamento: body.padraoNovoPedidoPagamento ?? 'DINHEIRO',
          padraoNovoPedidoTipoCartao: body.padraoNovoPedidoPagamento === 'CARTAO'
            ? (body.padraoNovoPedidoTipoCartao ?? 'CREDITO')
            : null,
          padraoNovoPedidoDescontosExpandidos: body.padraoNovoPedidoDescontosExpandidos ?? false,
          padraoNovoPedidoObservacoesExpandidas: body.padraoNovoPedidoObservacoesExpandidas ?? false,
          padraoNovoPedidoResponsavelExpandido: body.padraoNovoPedidoResponsavelExpandido ?? false,
          mensagemStatusAceito: body.mensagemStatusAceito,
          mensagemStatusPreparacao: body.mensagemStatusPreparacao,
          mensagemStatusEntregue: body.mensagemStatusEntregue,
          tenantId: admin.tenantId
        }
      })
      return NextResponse.json(hydrateConfigWithMessageDefaults(configuracao))
    }

    const configuracaoAtualizada = await prisma.configuracao.update({
      where: { id: configuracao.id },
      data: {
        freteBase: body.freteBase !== undefined ? Math.round(body.freteBase) : configuracao.freteBase,
        freteRaioKm: body.freteRaioKm ?? configuracao.freteRaioKm,
        freteKmExcedente: body.freteKmExcedente !== undefined ? Math.round(body.freteKmExcedente) : configuracao.freteKmExcedente,
        enderecoRetirada: body.enderecoRetirada ?? configuracao.enderecoRetirada,
        nomeEstabelecimento: body.nomeEstabelecimento ?? configuracao.nomeEstabelecimento,
        estabelecimentoLat: body.estabelecimentoLat ?? configuracao.estabelecimentoLat,
        estabelecimentoLng: body.estabelecimentoLng ?? configuracao.estabelecimentoLng,
        envioAutomaticoWhatsappStatus: body.envioAutomaticoWhatsappStatus ?? configuracao.envioAutomaticoWhatsappStatus,
        padraoNovoPedidoEntrega: body.padraoNovoPedidoEntrega ?? configuracao.padraoNovoPedidoEntrega,
        padraoNovoPedidoPagamento: body.padraoNovoPedidoPagamento ?? configuracao.padraoNovoPedidoPagamento,
        padraoNovoPedidoTipoCartao: body.padraoNovoPedidoPagamento
          ? (body.padraoNovoPedidoPagamento === 'CARTAO'
              ? (body.padraoNovoPedidoTipoCartao ?? configuracao.padraoNovoPedidoTipoCartao ?? 'CREDITO')
              : null)
          : configuracao.padraoNovoPedidoTipoCartao,
        padraoNovoPedidoDescontosExpandidos: body.padraoNovoPedidoDescontosExpandidos ?? configuracao.padraoNovoPedidoDescontosExpandidos,
        padraoNovoPedidoObservacoesExpandidas: body.padraoNovoPedidoObservacoesExpandidas ?? configuracao.padraoNovoPedidoObservacoesExpandidas,
        padraoNovoPedidoResponsavelExpandido: body.padraoNovoPedidoResponsavelExpandido ?? configuracao.padraoNovoPedidoResponsavelExpandido,
        mensagemStatusAceito: body.mensagemStatusAceito ?? configuracao.mensagemStatusAceito,
        mensagemStatusPreparacao: body.mensagemStatusPreparacao ?? configuracao.mensagemStatusPreparacao,
        mensagemStatusEntregue: body.mensagemStatusEntregue ?? configuracao.mensagemStatusEntregue
      }
    })

    appLogger.info('[api/admin/config] Configuracoes atualizadas')

    return NextResponse.json(hydrateConfigWithMessageDefaults(configuracaoAtualizada))
  } catch (error) {
    console.error('[v0] Erro ao atualizar configuracoes:', error)
    return NextResponse.json(
      { error: formatConfigSaveError(error) },
      { status: 500 }
    )
  }
}
