// Tipos do sistema de pedidos

export type StatusPedido = 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'PRONTO_ENTREGA' | 'ENTREGUE' | 'CANCELADO'
export type StatusPagamento = 'NAO_APLICAVEL' | 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REEMBOLSADO'
export type TipoPagamento = 'PIX' | 'DINHEIRO' | 'CARTAO'
export type TipoCartao = 'CREDITO' | 'DEBITO'
export type TipoEntrega = 'ENTREGA' | 'RESERVA_PAULISTANO' | 'RETIRADA' | 'ENCOMENDA'
export type ModoEncomendaCheckout = 'CLIENTE_DEFINE' | 'FIXO'
export type TipoCupom = 'FIXO' | 'PERCENTUAL'
export type StatusContaPagar = 'PENDENTE' | 'PAGO' | 'CANCELADO'
export type EscopoCategoriaFinanceira = 'PAGAR' | 'RECEBER' | 'AMBOS'
export type StatusDisponibilidadeProduto = 'DISPONIVEL' | 'SOMENTE_ENCOMENDA' | 'INDISPONIVEL'
export type OnlinePaymentGateway = 'ASAAS' | 'MERCADO_PAGO'
export type LojaClosureReason = 'MANUAL' | 'SCHEDULE'

export interface Categoria {
  id: string
  nome: string
  ordem: number
}

export interface Produto {
  id: string
  nome: string
  descricao?: string
  categoriaId: string
  preco: number // centavos
  ativo: boolean
  descontinuado: boolean
  novidade: boolean
  disponivelParaEncomenda: boolean
  imagemUrl?: string
  imagens?: string[]
  ordem: number
  estoqueDisponivel?: number
  statusDisponibilidade?: StatusDisponibilidadeProduto
}

export interface ItemPedido {
  id: string
  pedidoId: string
  produtoId: string
  nomeProdutoSnapshot: string
  precoUnitarioSnapshot: number // centavos
  quantidade: number
  totalItem: number // centavos
  quantidadePreparada?: number
  preparadoEm?: string | null
}

export interface SeparacaoResponsavelItem {
  produtoId: string
  nomeProduto: string
  quantidade: number
}

export interface SeparacaoResponsavelPessoa {
  nome: string
  itens: SeparacaoResponsavelItem[]
}

export interface Pedido {
  id: string
  clienteId?: string | null
  status: StatusPedido
  statusPagamento: StatusPagamento
  asaasCheckoutId?: string | null
  asaasCheckoutUrl?: string | null
  asaasCheckoutExpiresAt?: string | null
  asaasPaymentId?: string | null
  asaasInvoiceUrl?: string | null
  asaasPixQrCode?: string | null
  asaasPixCopyPaste?: string | null
  asaasPaymentStatus?: string | null
  asaasLastEventId?: string | null
  asaasLastSyncAt?: string | null
  clienteNome: string
  clienteTelefone?: string | null
  clienteWhatsapp?: string | null
  clienteBloco?: string | null
  clienteApartamento?: string | null
  clienteObservacoes?: string | null
  observacoesPedido?: string | null
  responsavelPedido?: string | null
  destinatariosPedido?: string | null
  separacaoResponsavel?: SeparacaoResponsavelPessoa[] | null
  levadoEm?: string | null
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao | null
  tipoEntrega: TipoEntrega
  encomendaPara?: string | null
  enderecoEntrega?: string
  enderecoRetirada: string
  frete: number // centavos
  subtotal: number // centavos
  total: number // centavos
  criadoEm: string
  motivoCancelamento?: string | null
  distanciaKm?: number | null
  descontoValor?: number | null // centavos
  cupomCodigoSnapshot?: string | null
  itens: ItemPedido[]
}

export interface PedidoPublico extends Pedido {
  publicAccessToken?: string | null
  pagamentoOnline?: {
    gateway: OnlinePaymentGateway
    checkoutUrl?: string | null
    invoiceUrl?: string | null
    pixQrCode?: string | null
    pixCopyPaste?: string | null
    expiresAt?: string | null
  } | null
}

export interface PedidoPublicoResumo {
  id: string
  status: StatusPedido
  statusPagamento: StatusPagamento
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao | null
  tipoEntrega: TipoEntrega
  encomendaPara?: string | null
  total: number
  criadoEm: string
  clienteNome: string
}

export interface Cliente {
  id: string
  nome: string
  telefone?: string | null
  whatsapp?: string | null
  clienteBloco?: string | null
  clienteApartamento?: string | null
  observacoes?: string | null
  mimosEntregues?: number
  criadoEm: string
  atualizadoEm: string
  pedidos?: Pedido[]
}

export interface ItemCarrinho {
  produto: Produto
  quantidade: number
}

export interface Configuracao {
  freteBase: number // centavos (ate o raio base)
  freteRaioKm: number // km
  freteKmExcedente: number // centavos por km excedente
  enderecoRetirada: string
  nomeEstabelecimento: string
  estabelecimentoLat: number
  estabelecimentoLng: number
  envioAutomaticoWhatsappStatus: boolean
  mensagemStatusAceito: string
  mensagemStatusPreparacao: string
  mensagemStatusEntregue: string
  padraoNovoPedidoEntrega?: TipoEntrega
  padraoNovoPedidoPagamento?: TipoPagamento
  padraoNovoPedidoTipoCartao?: TipoCartao | null
  padraoNovoPedidoDescontosExpandidos?: boolean
  padraoNovoPedidoObservacoesExpandidas?: boolean
  padraoNovoPedidoResponsavelExpandido?: boolean
  checkoutPublicoEntregaReservaPaulistano?: boolean
  checkoutPublicoEntregaRetirada?: boolean
  checkoutPublicoEntregaEncomenda?: boolean
  checkoutPublicoEncomendaModo?: ModoEncomendaCheckout
  checkoutPublicoEncomendaDataFixa?: string | null
  checkoutPublicoPagamentoPix?: boolean
  checkoutPublicoPagamentoDinheiro?: boolean
  checkoutPublicoPagamentoCartao?: boolean
  checkoutPublicoPagamentoCartaoCredito?: boolean
  checkoutPublicoPagamentoCartaoDebito?: boolean
  checkoutPublicoHorarioAtivo?: boolean
  checkoutPublicoHorarioAbertura?: string | null
  checkoutPublicoHorarioFechamento?: string | null
}

export interface LojaFuncionamentoStatus {
  isOpen: boolean
  manualOpen: boolean
  scheduleEnabled: boolean
  openTime?: string | null
  closeTime?: string | null
  scheduleSummary?: string | null
  closureReason?: LojaClosureReason | null
  statusLabel: string
  message: string
}

export interface RecentOrderReference {
  id: string
  accessToken?: string | null
}

export interface CheckoutPublicoConfig {
  entregas: {
    reservaPaulistano: boolean
    retirada: boolean
    encomenda: boolean
  }
  encomenda: {
    modo: ModoEncomendaCheckout
    dataFixa?: string | null
  }
  pagamentos: {
    pix: boolean
    dinheiro: boolean
    cartao: boolean
    cartaoCredito: boolean
    cartaoDebito: boolean
  }
  pagamentoOnline: {
    gateway: OnlinePaymentGateway | null
    cartaoDebitoSuportado: boolean
  }
  horarioFuncionamento?: {
    ativo: boolean
    abertura?: string | null
    fechamento?: string | null
    resumo?: string | null
  }
}

// Payload para criar pedido
export interface CriarPedidoPayload {
  clienteNome: string
  clienteTelefone: string
  clienteWhatsapp?: string
  clienteBloco?: string
  clienteApartamento?: string
  clienteObservacoes?: string
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao
  tipoEntrega: TipoEntrega
  encomendaPara?: string
  enderecoEntrega?: string
  distanciaKm?: number
  cupomCodigo?: string
  itens: {
    produtoId: string
    quantidade: number
  }[]
}

export interface Cupom {
  id: string
  codigo: string
  tipo: TipoCupom
  valor: number // centavos ou percentual
  ativo: boolean
  expiraEm: string
  maxUsos: number
  usos: number
  criadoEm: string
  atualizadoEm: string
}

export interface ContaPagar {
  id: string
  descricao: string
  categoria?: string | null
  categoriaFinanceiraId?: string | null
  fornecedorFinanceiroId?: string | null
  fornecedorFinanceiroNome?: string | null
  fornecedor?: string | null
  observacoes?: string | null
  valor: number
  vencimento: string
  pagoEm?: string | null
  status: StatusContaPagar
  criadoEm: string
  atualizadoEm: string
}

export interface CategoriaFinanceira {
  id: string
  nome: string
  escopo: EscopoCategoriaFinanceira
  ordem: number
  criadoEm: string
  atualizadoEm: string
}

export interface FornecedorFinanceiro {
  id: string
  nome: string
  criadoEm: string
  atualizadoEm: string
}

export interface PedidoAdminPayload {
  clienteId?: string
  clienteNome: string
  criadoEm?: string
  clienteTelefone?: string
  clienteWhatsapp?: string
  clienteBloco?: string
  clienteApartamento?: string
  clienteObservacoes?: string
  observacoesPedido?: string
  responsavelPedido?: string
  destinatariosPedido?: string
  separacaoResponsavel?: SeparacaoResponsavelPessoa[]
  levadoEm?: string
  pagamento: TipoPagamento
  tipoCartao?: TipoCartao
  tipoEntrega: TipoEntrega
  encomendaPara?: string
  statusPagamento?: StatusPagamento
  cupomCodigo?: string
  valorPromocional?: number
  itens: {
    produtoId: string
    quantidade: number
  }[]
}
