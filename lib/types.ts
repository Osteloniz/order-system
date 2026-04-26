// Tipos do sistema de pedidos

export type StatusPedido = 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'ENTREGUE' | 'CANCELADO'
export type StatusPagamento = 'NAO_APLICAVEL' | 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REEMBOLSADO'
export type TipoPagamento = 'PIX' | 'DINHEIRO' | 'CARTAO'
export type TipoEntrega = 'RESERVA_PAULISTANO' | 'RETIRADA' | 'ENCOMENDA'
export type TipoCupom = 'FIXO' | 'PERCENTUAL'

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
  imagemUrl?: string
  imagens?: string[]
  ordem: number
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
  mercadoPagoPaymentId?: string | null
  mercadoPagoPreferenceId?: string | null
  clienteNome: string
  clienteTelefone?: string | null
  clienteWhatsapp?: string | null
  clienteBloco?: string | null
  clienteApartamento?: string | null
  observacoesPedido?: string | null
  responsavelPedido?: string | null
  destinatariosPedido?: string | null
  separacaoResponsavel?: SeparacaoResponsavelPessoa[] | null
  levadoEm?: string | null
  pagamento: TipoPagamento
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

export interface Cliente {
  id: string
  nome: string
  telefone?: string | null
  whatsapp?: string | null
  clienteBloco?: string | null
  clienteApartamento?: string | null
  observacoes?: string | null
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

export interface PedidoAdminPayload {
  clienteId?: string
  clienteNome: string
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
