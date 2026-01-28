# API - Order System (rotas atuais)

Ultima atualizacao: 2026-01-27

Observacao: agora a API suporta multi-tenant (empresas separadas por `tenantId`).

## Publico (cliente)
- GET `/api/tenants`
  - Lista empresas disponiveis.
- POST `/api/tenant/select`
  - Body: `{ slug }`
  - Define o cookie `tenant_slug`.
- GET `/api/menu`
  - Retorna estabelecimento, endereco de retirada, parametros de frete e categorias.
  - Requer `tenant_slug`.
- POST `/api/pedidos`
  - Cria pedido.
  - Body: `CriarPedidoPayload` (ver `lib/types`).
  - Observacao: `distanciaKm` obrigatoria quando tipoEntrega = ENTREGA.
  - Observacao: `cupomCodigo` opcional (apenas 1 por pedido).
  - Observacao: retorna 403 se o estabelecimento estiver fechado.
- GET `/api/cupons/validar?codigo=...&subtotal=...`
  - Valida cupom e retorna `descontoValor`.
- GET `/api/pedidos?telefone=...`
  - Lista pedidos do cliente por telefone (tenant atual).
- GET `/api/pedidos/:id`
  - Retorna detalhe de um pedido (tenant atual).

## Admin (NextAuth - cookie de sessao)
Autenticacao:
- Login via `/admin/login` (usa `/api/auth` internamente).
- As rotas antigas `/api/admin/login`, `/api/admin/logout`, `/api/admin/session` estao desativadas (410).

Pedidos:
- GET `/api/admin/pedidos?status=FEITO|ACEITO|PREPARACAO|ENTREGUE|CANCELADO`
- PATCH `/api/admin/pedidos/:id/status`
  - Body: `{ status: StatusPedido, motivoCancelamento? }`
  - Observacao: para `CANCELADO` o motivo e obrigatorio.
- DELETE `/api/admin/pedidos/:id`
  - Remove o pedido (somente se estiver CANCELADO).

Categorias:
- GET `/api/admin/categorias`
- POST `/api/admin/categorias`
  - Body: `{ nome: string }`
- PUT `/api/admin/categorias/:id`
  - Body: `{ nome?: string; ordem?: number }`
- DELETE `/api/admin/categorias/:id`
  - Observacao: falha se a categoria tiver produtos.

Produtos:
- GET `/api/admin/produtos`
- POST `/api/admin/produtos`
  - Body: `{ nome, descricao?, categoriaId, preco, ativo?, imagemUrl?, imagens? }`
- PUT `/api/admin/produtos/:id`
  - Body: `{ nome?, descricao?, categoriaId?, preco?, ativo?, imagemUrl?, imagens?, ordem? }`
- PATCH `/api/admin/produtos/:id/ativo`
  - Body: `{ ativo: boolean }`
- DELETE `/api/admin/produtos/:id`
  - Observacao: falha se o produto estiver em algum pedido.

Configuracoes:
- GET `/api/admin/config`
- PUT `/api/admin/config`
  - Body: `{ freteBase?, freteRaioKm?, freteKmExcedente?, estabelecimentoLat?, estabelecimentoLng?, enderecoRetirada?, nomeEstabelecimento? }`

Tenant:
- GET `/api/admin/tenant`
- PUT `/api/admin/tenant`
  - Body: `{ isOpen: boolean }`

Cupons:
- GET `/api/admin/cupons`
- POST `/api/admin/cupons`
  - Body: `{ codigo, tipo, valor, maxUsos, expiraEm }`
  - Observacao: `valor` em centavos quando tipo = FIXO, ou percentual quando tipo = PERCENTUAL.
- PUT `/api/admin/cupons/:id`
  - Body: `{ codigo?, tipo?, valor?, maxUsos?, expiraEm?, ativo? }`
- DELETE `/api/admin/cupons/:id`
  - Observacao: falha se o cupom tiver usos > 0.
