// Tipos do sistema de pedidos

export type StatusPedido = 'FEITO' | 'ACEITO' | 'PREPARACAO' | 'ENTREGUE'
export type TipoPagamento = 'PIX' | 'DINHEIRO' | 'CARTAO'
export type TipoEntrega = 'ENTREGA' | 'RETIRADA'

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
  itens: ItemPedido[]
}

export interface ItemCarrinho {
  produto: Produto
  quantidade: number
}

export interface Configuracao {
  freteFixo: number // centavos
  enderecoRetirada: string
  nomeEstabelecimento: string
}

// Payload para criar pedido
export interface CriarPedidoPayload {
  clienteNome: string
  clienteTelefone: string
  pagamento: TipoPagamento
  tipoEntrega: TipoEntrega
  enderecoEntrega?: string
  itens: {
    produtoId: string
    quantidade: number
  }[]
}
