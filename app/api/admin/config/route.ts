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
  checkoutPublicoEntregaReservaPaulistano: z.boolean().optional(),
  checkoutPublicoEntregaRetirada: z.boolean().optional(),
  checkoutPublicoEntregaEncomenda: z.boolean().optional(),
  checkoutPublicoEncomendaModo: z.enum(['CLIENTE_DEFINE', 'FIXO']).optional(),
  checkoutPublicoEncomendaDataFixa: z.string().datetime({ offset: true }).nullable().optional(),
  checkoutPublicoPagamentoPix: z.boolean().optional(),
  checkoutPublicoPagamentoDinheiro: z.boolean().optional(),
  checkoutPublicoPagamentoCartao: z.boolean().optional(),
  checkoutPublicoPagamentoCartaoCredito: z.boolean().optional(),
  checkoutPublicoPagamentoCartaoDebito: z.boolean().optional(),
  checkoutPublicoHorarioAtivo: z.boolean().optional(),
  checkoutPublicoHorarioAbertura: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).nullable().optional(),
  checkoutPublicoHorarioFechamento: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).nullable().optional(),
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

  const entregas = [
    data.checkoutPublicoEntregaReservaPaulistano,
    data.checkoutPublicoEntregaRetirada,
    data.checkoutPublicoEntregaEncomenda,
  ]
  if (entregas.every((value) => value === false)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkoutPublicoEntregaReservaPaulistano'],
      message: 'Pelo menos um tipo de entrega deve ficar disponivel no checkout publico',
    })
  }

  const pagamentos = [
    data.checkoutPublicoPagamentoPix,
    data.checkoutPublicoPagamentoDinheiro,
    data.checkoutPublicoPagamentoCartao,
  ]
  if (pagamentos.every((value) => value === false)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkoutPublicoPagamentoPix'],
      message: 'Pelo menos uma forma de pagamento deve ficar disponivel no checkout publico',
    })
  }

  if (data.checkoutPublicoPagamentoCartao && data.checkoutPublicoPagamentoCartaoCredito === false && data.checkoutPublicoPagamentoCartaoDebito === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkoutPublicoPagamentoCartaoCredito'],
      message: 'Cartao precisa ter pelo menos uma opcao entre credito e debito',
    })
  }

  if (data.checkoutPublicoEntregaEncomenda && data.checkoutPublicoEncomendaModo === 'FIXO' && !data.checkoutPublicoEncomendaDataFixa) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkoutPublicoEncomendaDataFixa'],
      message: 'Informe a data fixa quando a encomenda estiver travada pela configuracao',
    })
  }

  if (data.checkoutPublicoHorarioAtivo) {
    if (!data.checkoutPublicoHorarioAbertura) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkoutPublicoHorarioAbertura'],
        message: 'Informe o horario de abertura quando o horario automatico estiver ativo',
      })
    }

    if (!data.checkoutPublicoHorarioFechamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkoutPublicoHorarioFechamento'],
        message: 'Informe o horario de fechamento quando o horario automatico estiver ativo',
      })
    }

    if (
      data.checkoutPublicoHorarioAbertura &&
      data.checkoutPublicoHorarioFechamento &&
      data.checkoutPublicoHorarioAbertura === data.checkoutPublicoHorarioFechamento
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkoutPublicoHorarioFechamento'],
        message: 'Abertura e fechamento nao podem ser iguais no horario automatico',
      })
    }
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
          checkoutPublicoHorarioAtivo: false,
          checkoutPublicoHorarioAbertura: null,
          checkoutPublicoHorarioFechamento: null,
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
          checkoutPublicoEntregaReservaPaulistano: body.checkoutPublicoEntregaReservaPaulistano ?? true,
          checkoutPublicoEntregaRetirada: body.checkoutPublicoEntregaRetirada ?? true,
          checkoutPublicoEntregaEncomenda: body.checkoutPublicoEntregaEncomenda ?? true,
          checkoutPublicoEncomendaModo: body.checkoutPublicoEncomendaModo ?? 'CLIENTE_DEFINE',
          checkoutPublicoEncomendaDataFixa: body.checkoutPublicoEncomendaModo === 'FIXO' && body.checkoutPublicoEncomendaDataFixa
            ? new Date(body.checkoutPublicoEncomendaDataFixa)
            : null,
          checkoutPublicoPagamentoPix: body.checkoutPublicoPagamentoPix ?? true,
          checkoutPublicoPagamentoDinheiro: body.checkoutPublicoPagamentoDinheiro ?? true,
          checkoutPublicoPagamentoCartao: body.checkoutPublicoPagamentoCartao ?? true,
          checkoutPublicoPagamentoCartaoCredito: body.checkoutPublicoPagamentoCartao === false
            ? false
            : (body.checkoutPublicoPagamentoCartaoCredito ?? true),
          checkoutPublicoPagamentoCartaoDebito: body.checkoutPublicoPagamentoCartao === false
            ? false
            : (body.checkoutPublicoPagamentoCartaoDebito ?? true),
          checkoutPublicoHorarioAtivo: body.checkoutPublicoHorarioAtivo ?? false,
          checkoutPublicoHorarioAbertura: body.checkoutPublicoHorarioAtivo
            ? (body.checkoutPublicoHorarioAbertura ?? null)
            : null,
          checkoutPublicoHorarioFechamento: body.checkoutPublicoHorarioAtivo
            ? (body.checkoutPublicoHorarioFechamento ?? null)
            : null,
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
        checkoutPublicoEntregaReservaPaulistano: body.checkoutPublicoEntregaReservaPaulistano ?? configuracao.checkoutPublicoEntregaReservaPaulistano,
        checkoutPublicoEntregaRetirada: body.checkoutPublicoEntregaRetirada ?? configuracao.checkoutPublicoEntregaRetirada,
        checkoutPublicoEntregaEncomenda: body.checkoutPublicoEntregaEncomenda ?? configuracao.checkoutPublicoEntregaEncomenda,
        checkoutPublicoEncomendaModo: body.checkoutPublicoEncomendaModo ?? configuracao.checkoutPublicoEncomendaModo,
        checkoutPublicoEncomendaDataFixa: body.checkoutPublicoEncomendaModo
          ? (body.checkoutPublicoEncomendaModo === 'FIXO'
              ? (body.checkoutPublicoEncomendaDataFixa ? new Date(body.checkoutPublicoEncomendaDataFixa) : configuracao.checkoutPublicoEncomendaDataFixa)
              : null)
          : configuracao.checkoutPublicoEncomendaDataFixa,
        checkoutPublicoPagamentoPix: body.checkoutPublicoPagamentoPix ?? configuracao.checkoutPublicoPagamentoPix,
        checkoutPublicoPagamentoDinheiro: body.checkoutPublicoPagamentoDinheiro ?? configuracao.checkoutPublicoPagamentoDinheiro,
        checkoutPublicoPagamentoCartao: body.checkoutPublicoPagamentoCartao ?? configuracao.checkoutPublicoPagamentoCartao,
        checkoutPublicoPagamentoCartaoCredito: body.checkoutPublicoPagamentoCartao !== undefined
          ? (body.checkoutPublicoPagamentoCartao
              ? (body.checkoutPublicoPagamentoCartaoCredito ?? configuracao.checkoutPublicoPagamentoCartaoCredito)
              : false)
          : (body.checkoutPublicoPagamentoCartaoCredito ?? configuracao.checkoutPublicoPagamentoCartaoCredito),
        checkoutPublicoPagamentoCartaoDebito: body.checkoutPublicoPagamentoCartao !== undefined
          ? (body.checkoutPublicoPagamentoCartao
              ? (body.checkoutPublicoPagamentoCartaoDebito ?? configuracao.checkoutPublicoPagamentoCartaoDebito)
              : false)
          : (body.checkoutPublicoPagamentoCartaoDebito ?? configuracao.checkoutPublicoPagamentoCartaoDebito),
        checkoutPublicoHorarioAtivo: body.checkoutPublicoHorarioAtivo ?? configuracao.checkoutPublicoHorarioAtivo,
        checkoutPublicoHorarioAbertura: body.checkoutPublicoHorarioAtivo !== undefined
          ? (body.checkoutPublicoHorarioAtivo
              ? (body.checkoutPublicoHorarioAbertura ?? configuracao.checkoutPublicoHorarioAbertura)
              : null)
          : (body.checkoutPublicoHorarioAbertura ?? configuracao.checkoutPublicoHorarioAbertura),
        checkoutPublicoHorarioFechamento: body.checkoutPublicoHorarioAtivo !== undefined
          ? (body.checkoutPublicoHorarioAtivo
              ? (body.checkoutPublicoHorarioFechamento ?? configuracao.checkoutPublicoHorarioFechamento)
              : null)
          : (body.checkoutPublicoHorarioFechamento ?? configuracao.checkoutPublicoHorarioFechamento),
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
