// Tipos do sistema de pedidos

export type StatusPedido = 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'ENTREGUE' | 'CANCELADO'
export type TipoPagamento = 'PIX' | 'DINHEIRO' | 'CARTAO'
export type TipoEntrega = 'ENTREGA' | 'RETIRADA'
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
}

export interface Pedido {
  id: string
  status: StatusPedido
  clienteNome: string
  clienteTelefone: string
  pagamento: TipoPagamento
  tipoEntrega: TipoEntrega
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
}

// Payload para criar pedido
export interface CriarPedidoPayload {
  clienteNome: string
  clienteTelefone: string
  pagamento: TipoPagamento
  tipoEntrega: TipoEntrega
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
