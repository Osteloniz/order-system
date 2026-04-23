import type { Configuracao, Pedido, StatusPedido } from '@/lib/types'
import { formatarMoeda } from '@/lib/calc'

const pagamentoLabels = { PIX: 'PIX', CARTAO: 'Cartao', DINHEIRO: 'Dinheiro' } as const
const entregaLabels = { RESERVA_PAULISTANO: 'Reserva', RETIRADA: 'Retirada', ENCOMENDA: 'Encomenda' } as const
const statusPagamentoLabels = {
  NAO_APLICAVEL: 'Pagamento na entrega',
  PENDENTE: 'Pagamento pendente',
  APROVADO: 'Pagamento aprovado',
  RECUSADO: 'Pagamento recusado',
  CANCELADO: 'Pagamento cancelado',
  REEMBOLSADO: 'Pagamento reembolsado',
} as const

export const defaultStatusMessageTemplates = {
  ACEITO: [
    'O seu pedido foi aceito.',
    '',
    'Resumo do pedido:',
    '{itens}',
    '',
    'Total = {total}',
    '',
    'Pagamento: {pagamento}',
  ].join('\n'),
  PREPARACAO: [
    'Seu pedido esta em preparo.',
    '{linha_pagamento}',
    '',
    'Resumo do pedido:',
    '{itens}',
    '',
    'Total = {total}',
  ].join('\n'),
  ENTREGUE: [
    'Muito obrigado pela sua compra!',
    '',
    'A sua opiniao e muito importante para nos. Se puder, envie um feedback contando como foi a sua experiencia com o pedido.',
    '',
    'Dica especial para aproveitar ainda mais os nossos cookies:',
    '',
    'Eles ja sao deliciosos em qualquer momento, mas se voce gosta de saborear quentinho, coloque no micro-ondas por apenas 15 segundos. O resultado e sensacional: massa macia, aroma irresistivel e sabor ainda mais intenso!',
    '',
    'Experiencia unica garantida.',
  ].join('\n'),
} as const satisfies Record<'ACEITO' | 'PREPARACAO' | 'ENTREGUE', string>

export const statusMessageTemplateFields = [
  {
    status: 'ACEITO',
    key: 'mensagemStatusAceito',
    title: 'Mensagem de pedido aceito',
    description: 'Enviada quando o pedido sai de novo para aceito.',
  },
  {
    status: 'PREPARACAO',
    key: 'mensagemStatusPreparacao',
    title: 'Mensagem de pedido em preparo',
    description: 'Enviada quando a producao comeca.',
  },
  {
    status: 'ENTREGUE',
    key: 'mensagemStatusEntregue',
    title: 'Mensagem de pedido entregue',
    description: 'Usada no fechamento e nos reenvios.',
  },
] as const

type StatusMessageKey = (typeof statusMessageTemplateFields)[number]['key']
type ConfiguracaoWithNullableMessages = {
  freteBase?: number
  freteRaioKm?: number
  freteKmExcedente?: number
  enderecoRetirada?: string
  nomeEstabelecimento?: string
  estabelecimentoLat?: number
  estabelecimentoLng?: number
  envioAutomaticoWhatsappStatus?: boolean | null
  mensagemStatusAceito?: string | null
  mensagemStatusPreparacao?: string | null
  mensagemStatusEntregue?: string | null
}

export function hydrateConfigWithMessageDefaults(config: ConfiguracaoWithNullableMessages | null | undefined): Configuracao {
  return {
    freteBase: config?.freteBase ?? 500,
    freteRaioKm: config?.freteRaioKm ?? 3,
    freteKmExcedente: config?.freteKmExcedente ?? 100,
    enderecoRetirada: config?.enderecoRetirada ?? 'Endereco nao configurado',
    nomeEstabelecimento: config?.nomeEstabelecimento ?? 'Estabelecimento',
    estabelecimentoLat: config?.estabelecimentoLat ?? 0,
    estabelecimentoLng: config?.estabelecimentoLng ?? 0,
    envioAutomaticoWhatsappStatus: config?.envioAutomaticoWhatsappStatus ?? true,
    mensagemStatusAceito: sanitizeTemplate(config?.mensagemStatusAceito, defaultStatusMessageTemplates.ACEITO),
    mensagemStatusPreparacao: sanitizeTemplate(config?.mensagemStatusPreparacao, defaultStatusMessageTemplates.PREPARACAO),
    mensagemStatusEntregue: sanitizeTemplate(config?.mensagemStatusEntregue, defaultStatusMessageTemplates.ENTREGUE),
  }
}

function sanitizeTemplate(template: string | null | undefined, fallback: string) {
  const normalized = template?.trim()
  return normalized ? normalized : fallback
}

export function buildStatusMessage(pedido: Pedido, status: StatusPedido, config?: ConfiguracaoWithNullableMessages | null) {
  const hydratedConfig = hydrateConfigWithMessageDefaults(config)
  const templateByStatus: Partial<Record<StatusPedido, string>> = {
    ACEITO: hydratedConfig.mensagemStatusAceito,
    PREPARACAO: hydratedConfig.mensagemStatusPreparacao,
    ENTREGUE: hydratedConfig.mensagemStatusEntregue,
  }

  const template = templateByStatus[status]
  if (!template) return ''

  const replacements = {
    pedido_codigo: pedido.id.slice(-8).toUpperCase(),
    cliente_nome: pedido.clienteNome,
    itens: pedido.itens.map(item => `- ${item.quantidade}x ${item.nomeProdutoSnapshot}`).join('\n'),
    total: formatarMoeda(pedido.total),
    pagamento: pagamentoLabels[pedido.pagamento],
    status_pagamento: statusPagamentoLabels[pedido.statusPagamento],
    tipo_entrega: entregaLabels[pedido.tipoEntrega],
    linha_pagamento: pedido.statusPagamento === 'APROVADO' ? 'Pagamento confirmado.' : 'Estamos aguardando pagamento.',
  }

  return template.replace(/\{([a-z_]+)\}/g, (fullMatch, key: keyof typeof replacements) => replacements[key] ?? fullMatch).trim()
}

export function buildPaymentReminderMessage(pedido: Pedido) {
  const itens = pedido.itens.map(item => `- ${item.quantidade}x ${item.nomeProdutoSnapshot}`).join('\n')
  return [
    `Oi, ${pedido.clienteNome}!`,
    '',
    `O pagamento do seu pedido #${pedido.id.slice(-8).toUpperCase()} ainda esta pendente.`,
    '',
    'Resumo do pedido:',
    itens,
    '',
    `Total: ${formatarMoeda(pedido.total)}`,
    `Forma de pagamento: ${pagamentoLabels[pedido.pagamento]}`,
    '',
    'Se precisar, me chama por aqui que eu te ajudo.',
  ].join('\n')
}

export function getDefaultStatusTemplate(field: StatusMessageKey) {
  const defaultsByField: Record<StatusMessageKey, string> = {
    mensagemStatusAceito: defaultStatusMessageTemplates.ACEITO,
    mensagemStatusPreparacao: defaultStatusMessageTemplates.PREPARACAO,
    mensagemStatusEntregue: defaultStatusMessageTemplates.ENTREGUE,
  }

  return defaultsByField[field]
}

export const supportedStatusTemplateVariables = [
  '{pedido_codigo}',
  '{cliente_nome}',
  '{itens}',
  '{total}',
  '{pagamento}',
  '{status_pagamento}',
  '{tipo_entrega}',
  '{linha_pagamento}',
]
