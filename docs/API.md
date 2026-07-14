# API - Order System (rotas atuais)

Ultima atualizacao: 2026-07-13

Observacao: agora a API suporta multi-tenant (empresas separadas por `tenantId`).

## Publico (cliente)
- GET `/api/tenants`
  - Lista empresas disponiveis.
- POST `/api/tenant/select`
  - Body: `{ slug }`
  - Define o cookie `tenant_slug`.
- POST `/api/clientes/prefill`
  - Body: `{ telefone }`
  - Faz busca por telefone normalizado no tenant atual para pre-preencher nome e endereco do cliente no checkout.
  - Observacao: retorna apenas dados operacionais minimos do cadastro, sem historico de pedidos, sem telefone completo de volta no payload e com limitacao de tentativas.
- GET `/api/menu`
  - Retorna estabelecimento, endereco de retirada, parametros de frete, regras do checkout publico e categorias.
  - Requer `tenant_slug`.
- POST `/api/pedidos`
  - Cria pedido.
  - Body: `CriarPedidoPayload` (ver `lib/types`).
  - Observacao: `cupomCodigo` opcional (apenas 1 por pedido).
  - Observacao: os tipos de entrega e pagamento aceitos dependem da configuracao publica do tenant.
  - Observacao: para `ENCOMENDA`, a data pode ser definida pelo cliente ou fixada pelo admin nas configuracoes.
  - Observacao: para pagamento em `CARTAO`, o checkout publico pode exigir a escolha entre `CREDITO` e `DEBITO`, conforme configuracao.
  - Observacao: pedidos novos retornam um `publicAccessToken`, usado para abrir a confirmacao e cancelar o pedido com seguranca.
  - Observacao: retorna 403 se o estabelecimento estiver fechado.
- GET `/api/cupons/validar?codigo=...&subtotal=...`
  - Valida cupom e retorna `descontoValor`.
- GET `/api/pedidos/:id`
  - Retorna detalhe de um pedido (tenant atual).
  - Observacao: para pedidos novos, exige o token enviado no header `x-order-access-token` ou na query `?token=...`.
  - Observacao: pedidos antigos sem token salvo recebem um token novo no primeiro acesso bem-sucedido da confirmacao para manter compatibilidade de transicao.
- PATCH `/api/pedidos/:id`
  - Cancela pedido pelo cliente enquanto ele ainda estiver em `FEITO` e sem pagamento aprovado.
  - Observacao: exige o mesmo token publico de acesso do pedido.

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
  - Body: `{ freteBase?, freteRaioKm?, freteKmExcedente?, estabelecimentoLat?, estabelecimentoLng?, enderecoRetirada?, nomeEstabelecimento?, envioAutomaticoWhatsappStatus?, mensagemStatusAceito?, mensagemStatusPreparacao?, mensagemStatusEntregue?, padraoNovoPedidoEntrega?, padraoNovoPedidoPagamento?, padraoNovoPedidoTipoCartao?, padraoNovoPedidoDescontosExpandidos?, padraoNovoPedidoObservacoesExpandidas?, padraoNovoPedidoResponsavelExpandido?, checkoutPublicoEntregaReservaPaulistano?, checkoutPublicoEntregaRetirada?, checkoutPublicoEntregaEncomenda?, checkoutPublicoEncomendaModo?, checkoutPublicoEncomendaDataFixa?, checkoutPublicoPagamentoPix?, checkoutPublicoPagamentoDinheiro?, checkoutPublicoPagamentoCartao?, checkoutPublicoPagamentoCartaoCredito?, checkoutPublicoPagamentoCartaoDebito? }`
  - Observacao: `padraoNovoPedidoTipoCartao` so deve ser enviado quando `padraoNovoPedidoPagamento = CARTAO`.
  - Observacao: pelo menos um tipo de entrega e uma forma de pagamento devem permanecer habilitados no checkout publico.
  - Observacao: quando `checkoutPublicoEncomendaModo = FIXO`, `checkoutPublicoEncomendaDataFixa` passa a ser obrigatoria.
  - Observacao: quando `checkoutPublicoPagamentoCartao = true`, pelo menos uma opcao entre credito e debito deve permanecer habilitada.

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

Clientes:
- GET `/api/admin/clientes?search=...`
- GET `/api/admin/clientes/:id`
- POST `/api/admin/clientes`
- PATCH `/api/admin/clientes/:id`
- POST `/api/admin/clientes/:id/mimo`
  - Marca 1 mimo entregue no fidelidade.
  - Observacao: cada mimo exige 14 cookies comprados.
  - Observacao: a entrega faz baixa de 1 unidade do produto `Cookie Tradicional` no estoque.
  - Observacao: nao cria contas a receber; o valor fica apenas como referencia operacional/relatorio.

Financeiro:
- GET `/api/admin/financeiro/contas-pagar?from=YYYY-MM-DD&to=YYYY-MM-DD&status=TODOS|PENDENTE|PAGO|CANCELADO`
- POST `/api/admin/financeiro/contas-pagar`
  - Body: `{ descricao, valor, vencimento, status?, categoriaFinanceiraId?, fornecedorFinanceiroId?, observacoes? }`
  - Observacao: `vencimento` e `pagoEm` aceitam ISO datetime com offset.
  - Observacao: o backend preserva `fornecedor` como texto legado e vincula `fornecedorFinanceiroId` quando houver cadastro.
- PATCH `/api/admin/financeiro/contas-pagar/:id`
  - Body: igual ao POST.
- DELETE `/api/admin/financeiro/contas-pagar/:id`
- GET `/api/admin/categorias-financeiras?escopo=PAGAR|RECEBER|AMBOS|TODOS`
- POST `/api/admin/categorias-financeiras`
  - Body: `{ nome, escopo }`
- GET `/api/admin/fornecedores-financeiros`
- POST `/api/admin/fornecedores-financeiros`
  - Body: `{ nome }`
  - Observacao: se o fornecedor ja existir para o tenant, retorna o cadastro existente.

Relatorios:
- GET `/api/admin/relatorios?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Observacao: agora inclui agregacao de custos por fornecedor no periodo.
