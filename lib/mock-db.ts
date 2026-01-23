import type { Categoria, Produto, Pedido, Configuracao } from './types'

// Configuração do estabelecimento
export const configuracao: Configuracao = {
  freteFixo: 0, // R$ 5,00
  enderecoRetirada: 'Endereço de Retirada Exemplo, 123 - Centro',
  nomeEstabelecimento: 'Nossa Pimenta'
}

// Categorias mockadas
export const categorias: Categoria[] = [
  { id: 'cat-1', nome: 'Molhos', ordem: 1 },
]

// Produtos mockados
export const produtos: Produto[] = [
  // Lanches
  {
    id: 'prod-1',
    nome: 'Queridinha',
    descricao: 'Molho artesanal, pimenta dedo de moça e especiarias',
    categoriaId: 'cat-1',
    preco: 1200, // R$ 25,00
    ativo: true,
    imagens: ['./Queridinha.png', '/placeholder.svg'],
    ordem: 1,
  },
  {
    id: 'prod-2',
    nome: 'Queima Guela',
    descricao: 'Molho artesanal, pimenta carolina reaper e especiarias',
    categoriaId: 'cat-1',
    preco: 1200,
    ativo: true,
    imagemUrl: './QUEIMA.png',
    ordem: 2,
  },
  // {
  //   id: 'prod-3',
  //   nome: 'X-Salada',
  //   descricao: 'Hambúrguer, queijo, alface, tomate, cebola e maionese',
  //   categoriaId: 'cat-1',
  //   preco: 2200,
  //   ativo: true,
  //   ordem: 3,
  // },
  // // Pizzas
  // {
  //   id: 'prod-4',
  //   nome: 'Pizza Margherita',
  //   descricao: 'Molho de tomate, mussarela, tomate e manjericão fresco',
  //   categoriaId: 'cat-2',
  //   preco: 4500,
  //   ativo: true,
  //   ordem: 1,
  // },
  // {
  //   id: 'prod-5',
  //   nome: 'Pizza Calabresa',
  //   descricao: 'Molho de tomate, mussarela e calabresa fatiada',
  //   categoriaId: 'cat-2',
  //   preco: 4200,
  //   ativo: true,
  //   ordem: 2,
  // },
  // {
  //   id: 'prod-6',
  //   nome: 'Pizza 4 Queijos',
  //   descricao: 'Mussarela, provolone, gorgonzola e parmesão',
  //   categoriaId: 'cat-2',
  //   preco: 4800,
  //   ativo: true,
  //   ordem: 3,
  // },
  // // Bebidas
  // {
  //   id: 'prod-7',
  //   nome: 'Refrigerante Lata',
  //   descricao: 'Coca-Cola, Guaraná ou Fanta - 350ml',
  //   categoriaId: 'cat-3',
  //   preco: 600,
  //   ativo: true,
  //   ordem: 1,
  // },
  // {
  //   id: 'prod-8',
  //   nome: 'Suco Natural',
  //   descricao: 'Laranja, Limão ou Maracujá - 500ml',
  //   categoriaId: 'cat-3',
  //   preco: 900,
  //   ativo: true,
  //   ordem: 2,
  // },
  // {
  //   id: 'prod-9',
  //   nome: 'Água Mineral',
  //   descricao: '500ml com ou sem gás',
  //   categoriaId: 'cat-3',
  //   preco: 400,
  //   ativo: false,
  //   ordem: 3,
  // },
  // // Sobremesas
  // {
  //   id: 'prod-10',
  //   nome: 'Petit Gateau',
  //   descricao: 'Bolo de chocolate com recheio cremoso e sorvete de baunilha',
  //   categoriaId: 'cat-4',
  //   preco: 1800,
  //   ativo: true,
  //   ordem: 1,
  // },
  // {
  //   id: 'prod-11',
  //   nome: 'Pudim',
  //   descricao: 'Pudim de leite condensado tradicional',
  //   categoriaId: 'cat-4',
  //   preco: 1200,
  //   ativo: true,
  //   ordem: 2,
  // },
]

// Pedidos (começa vazio, será populado em runtime)
export const pedidos: Pedido[] = [
  // {
  //   id: 'ped-001',
  //   status: 'FEITO',
  //   clienteNome: 'João Silva',
  //   clienteTelefone: '11999998888',
  //   pagamento: 'PIX',
  //   tipoEntrega: 'ENTREGA',
  //   enderecoEntrega: 'Rua dos Ipês, 456 - Jardim',
  //   enderecoRetirada: configuracao.enderecoRetirada,
  //   frete: 500,
  //   subtotal: 5400,
  //   total: 5900,
  //   criadoEm: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  //   itens: [
  //     {
  //       id: 'item-001',
  //       pedidoId: 'ped-001',
  //       produtoId: 'prod-1',
  //       nomeProdutoSnapshot: 'X-Burger',
  //       precoUnitarioSnapshot: 2500,
  //       quantidade: 2,
  //       totalItem: 5000,
  //     },
  //     {
  //       id: 'item-002',
  //       pedidoId: 'ped-001',
  //       produtoId: 'prod-7',
  //       nomeProdutoSnapshot: 'Refrigerante Lata',
  //       precoUnitarioSnapshot: 600,
  //       quantidade: 1,
  //       totalItem: 600,
  //     },
  //   ],
  // },
  // {
  //   id: 'ped-002',
  //   status: 'ACEITO',
  //   clienteNome: 'Maria Santos',
  //   clienteTelefone: '11988887777',
  //   pagamento: 'CARTAO',
  //   tipoEntrega: 'RETIRADA',
  //   enderecoRetirada: configuracao.enderecoRetirada,
  //   frete: 0,
  //   subtotal: 4500,
  //   total: 4500,
  //   criadoEm: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  //   itens: [
  //     {
  //       id: 'item-003',
  //       pedidoId: 'ped-002',
  //       produtoId: 'prod-4',
  //       nomeProdutoSnapshot: 'Pizza Margherita',
  //       precoUnitarioSnapshot: 4500,
  //       quantidade: 1,
  //       totalItem: 4500,
  //     },
  //   ],
  // },
]

// Funções auxiliares
export function gerarId(prefixo: string): string {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
