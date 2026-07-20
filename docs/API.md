# API - Order System (rotas atuais)

Ultima atualizacao: 2026-07-19

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
- POST `/api/pedidos/recentes`
  - Body: `{ telefone }`
  - Localiza os ultimos pedidos vinculados ao telefone no tenant atual e devolve um resumo minimo para a faixa publica de acompanhamento.
  - Observacao: aplica rate limit, nao devolve o telefone de volta no payload e emite um cookie publico assinado por telefone para permitir abrir a confirmacao e retomar o pagamento no mesmo navegador.
- GET `/api/menu`
  - Retorna estabelecimento, endereco de retirada, parametros de frete, regras do checkout publico e categorias.
  - Observacao: agora tambem retorna `novidades`, com os produtos ativos marcados manualmente para destaque no menu.
  - Observacao: agora tambem retorna `indisponiveis`, para manter visiveis os produtos bloqueados temporariamente no cardapio publico.
  - Observacao: cada produto do menu pode retornar `estoqueDisponivel`, `statusDisponibilidade` e `disponivelParaEncomenda` para o frontend respeitar venda imediata, somente encomenda ou indisponibilidade.
  - Observacao: `estoqueDisponivel` agora considera tambem um abatimento de seguranca para pedidos ja comprometidos e ainda nao refletidos como reserva formal no estoque.
  - Observacao: `checkoutPublico` agora tambem informa `pagamentoOnline`, incluindo o gateway ativo e se debito online e suportado.
  - Observacao: a resposta agora tambem inclui `lojaStatus` e o `isOpen` efetivo, considerando o toggle manual da loja e o horario automatico diario configurado no admin.
  - Observacao: `checkoutPublico.horarioFuncionamento` informa se o horario automatico esta ativo e qual janela diaria de atendimento foi configurada.
  - Observacao: quando o gateway online for Asaas, `pix` so deve aparecer como disponivel se a conta autenticada tiver ao menos uma chave Pix ativa.
  - Requer `tenant_slug`.
- POST `/api/pedidos`
  - Cria pedido.
  - Body: `CriarPedidoPayload` (ver `lib/types`).
  - Observacao: `cupomCodigo` opcional (apenas 1 por pedido).
  - Observacao: os tipos de entrega e pagamento aceitos dependem da configuracao publica do tenant.
  - Observacao: para `ENCOMENDA`, a data pode ser definida pelo cliente ou fixada pelo admin nas configuracoes.
  - Observacao: para pagamento em `CARTAO`, o checkout publico pode exigir a escolha entre `CREDITO` e `DEBITO`, conforme configuracao.
  - Observacao: pedidos novos passam a receber o acesso publico por cookie `HttpOnly` no navegador do cliente; o token nao deve mais aparecer em URL nem depender de armazenamento em `localStorage`.
  - Observacao: quando houver gateway online configurado (`ASAAS` ou `MERCADO_PAGO`), pedidos com `PIX` ou `CARTAO` iniciam tambem o fluxo online e retornam `pagamentoOnline`.
  - Observacao: na configuracao atual com Mercado Pago, `CARTAO` segue usando Checkout Pro, enquanto `PIX` usa a API direta como fluxo principal e retorna QR Code + codigo copia-e-cola para pagamento sem depender do checkout hospedado.
  - Observacao: o checkout hospedado deve refletir o valor final salvo do pedido, incluindo frete e descontos aplicados no proprio pedido, sem divergencia para o preco cheio dos itens.
  - Observacao: a validacao de disponibilidade agora tambem considera pedidos comprometidos que ainda nao tenham virado reserva formal no estoque, como protecao adicional contra oversell.
  - Observacao: se a conta Asaas nao tiver chave Pix ativa, pedidos em `PIX` devem ser bloqueados mesmo que a configuracao publica local esteja ligada.
  - Observacao: retorna 403 se o estabelecimento estiver fechado, seja por fechamento manual ou por estar fora do horario automatico configurado.
- GET `/api/cupons/validar?codigo=...&subtotal=...`
  - Valida cupom e retorna `descontoValor`.
- GET `/api/pedidos/:id`
  - Retorna detalhe de um pedido (tenant atual).
  - Observacao: exige acesso publico valido ao pedido; o fluxo padrao usa cookie `HttpOnly` por pedido, e agora tambem pode aceitar o cookie publico assinado por telefone quando o cliente tiver recuperado os ultimos pedidos pelo numero.
  - Observacao: header `x-order-access-token` e query `?token=...` seguem aceitos apenas para compatibilidade controlada.
  - Observacao: pedidos antigos sem `publicAccessTokenHash` nao recebem mais token novo automaticamente no primeiro acesso publico; a transicao agora falha fechada.
  - Observacao: pode retornar `pagamentoOnline` com o link atual do checkout/pagamento hospedado.
- POST `/api/pedidos/:id/pagamento`
  - Retoma ou renova o pagamento online de um pedido.
  - Body: `{ action: 'RESUME' | 'REFRESH_LINK' | 'PIX_FALLBACK' }`
  - Observacao: exige o mesmo acesso publico valido do pedido, preferencialmente via cookie `HttpOnly`.
  - Observacao: `RESUME` segue voltado ao checkout hospedado de cartao; para Pix do Mercado Pago, o fluxo operacional deve usar QR Code/copia-e-cola direto.
  - Observacao: `REFRESH_LINK` reaproveita o checkout atual quando possivel e, para Pix do Mercado Pago, migra pedidos antigos sem QR salvo para o fluxo direto ou devolve novamente os dados atuais do QR/copia-e-cola.
  - Observacao: `PIX_FALLBACK` permanece apenas como compatibilidade tecnica e nao deve mais ser tratado como fluxo principal do frontend.
  - Observacao: quando o pedido tiver sido editado e a composicao financeira mudar, o estado local do checkout antigo pode ser limpo para impedir o reaproveitamento de um link com valor stale.
  - Observacao: na fase atual de HML com Mercado Pago, pedidos com link pendente ativo podem bloquear certas edicoes para evitar divergencia de cobranca.
- PATCH `/api/pedidos/:id`
  - Cancela pedido pelo cliente enquanto ele ainda estiver em `FEITO` e sem pagamento aprovado.
  - Observacao: exige o mesmo acesso publico valido do pedido, preferencialmente via cookie `HttpOnly`.
  - Observacao: pedidos com checkout online Asaas nao aceitam cancelamento publico automatico, para evitar inconsistencias entre pedido e gateway.
- POST `/api/asaas/webhook`
  - Recebe eventos de pagamento enviados pelo Asaas.
  - Observacao: exige validacao do header `asaas-access-token`.
  - Observacao: processa eventos de forma idempotente pelo `event.id` e atualiza `statusPagamento` do pedido usando `externalReference`.
  - Observacao: quando o pagamento aprovado chega para um pedido em `PREPARACAO`, o backend pode promover automaticamente o status para `PRONTO_ENTREGA`; se o pagamento deixar de estar aprovado antes da entrega, o pedido pode voltar para `PREPARACAO`.
- POST `/api/mercadopago/webhook`
  - Recebe notificacoes de pagamento enviadas pelo Mercado Pago.
  - Observacao: exige validacao da assinatura `x-signature` com o segredo configurado em `MERCADO_PAGO_WEBHOOK_SECRET`.
  - Observacao: busca o pagamento completo pela `data.id`, valida o token embutido no `external_reference` e ignora notificacoes stale.
  - Observacao: atualiza `statusPagamento` do pedido e reaproveita a mesma logica de status e estoque do kanban.

## Admin (NextAuth - cookie de sessao)
Autenticacao:
- Login via `/admin/login` (usa `/api/auth` internamente).
- As rotas antigas `/api/admin/login`, `/api/admin/logout`, `/api/admin/session` estao desativadas (410).

Pedidos:
- GET `/api/admin/pedidos?status=FEITO|ACEITO|PREPARACAO|PRONTO_ENTREGA|ENTREGUE|CANCELADO`
- GET `/api/admin/kds?date=YYYY-MM-DD&windowDays=0..7`
  - Retorna pedidos abertos para o painel KDS operacional.
  - Observacao: pedidos comuns entram no radar ate o fim do dia de referencia; `ENCOMENDA` aberta entra ate o horizonte configurado em `windowDays`.
  - Observacao: reaproveita os mesmos status e regras do kanban; o KDS nao cria um fluxo paralelo de negocio.
- PATCH `/api/admin/pedidos/:id`
  - Edita pedido em aberto.
  - Observacao: se o pedido for online e ainda estiver pendente, mudancas em itens, desconto, frete, forma de pagamento ou dados relevantes da cobranca invalidam o checkout local anterior para que o proximo link seja gerado com o valor atualizado.
  - Observacao: na fase atual de HML com Mercado Pago, pedidos com link pendente ativo bloqueiam essas edicoes para evitar divergencia entre o valor do pedido e uma cobranca antiga ainda valida fora do sistema.
- POST `/api/admin/pedidos/:id/pagamento`
  - Body: `{ action: 'REFRESH_LINK' }` ou `{ action: 'SWITCH_METHOD', pagamento: 'PIX' | 'DINHEIRO' | 'CARTAO', tipoCartao? }`
  - Observacao: `REFRESH_LINK` reaproveita o checkout atual quando ainda estiver valido e so gera outro quando necessario.
  - Observacao: a troca de forma de pagamento bloqueia mudancas que possam deixar um checkout online ainda ativo e gerar cobranca duplicada.
  - Observacao: as respostas dessas acoes retornam o pedido completo para manter subtotal, desconto e total consistentes no painel admin.
- Observacao operacional: pedidos comuns agora reservam estoque quando o compromisso fica confirmado:
  - online: `statusPagamento = APROVADO`
  - dinheiro: a partir de `ACEITO`
  - entrega: continua sendo o momento da baixa definitiva
- PATCH `/api/admin/pedidos/:id/status`
  - Body: `{ status: StatusPedido, motivoCancelamento? }`
  - Observacao: para `CANCELADO` o motivo e obrigatorio.
  - Observacao: `PRONTO_ENTREGA` fica reservado para pedidos com pagamento aprovado e representa o estado pago, pronto e aguardando apenas a entrega/retirada final.
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
  - Body: `{ nome, descricao?, categoriaId, preco, ativo?, descontinuado?, novidade?, disponivelParaEncomenda?, imagemUrl?, imagens? }`
- PUT `/api/admin/produtos/:id`
  - Body: `{ nome?, descricao?, categoriaId?, preco?, ativo?, descontinuado?, novidade?, disponivelParaEncomenda?, imagemUrl?, imagens?, ordem? }`
- PATCH `/api/admin/produtos/:id/ativo`
  - Body: `{ ativo: boolean }`
- DELETE `/api/admin/produtos/:id`
  - Observacao: falha se o produto estiver em algum pedido.

Configuracoes:
- GET `/api/admin/config`
- PUT `/api/admin/config`
  - Body: `{ freteBase?, freteRaioKm?, freteKmExcedente?, estabelecimentoLat?, estabelecimentoLng?, enderecoRetirada?, nomeEstabelecimento?, envioAutomaticoWhatsappStatus?, mensagemStatusAceito?, mensagemStatusPreparacao?, mensagemStatusEntregue?, padraoNovoPedidoEntrega?, padraoNovoPedidoPagamento?, padraoNovoPedidoTipoCartao?, padraoNovoPedidoDescontosExpandidos?, padraoNovoPedidoObservacoesExpandidas?, padraoNovoPedidoResponsavelExpandido?, checkoutPublicoEntregaReservaPaulistano?, checkoutPublicoEntregaRetirada?, checkoutPublicoEntregaEncomenda?, checkoutPublicoEncomendaModo?, checkoutPublicoEncomendaDataFixa?, checkoutPublicoPagamentoPix?, checkoutPublicoPagamentoDinheiro?, checkoutPublicoPagamentoCartao?, checkoutPublicoPagamentoCartaoCredito?, checkoutPublicoPagamentoCartaoDebito?, checkoutPublicoHorarioAtivo?, checkoutPublicoHorarioAbertura?, checkoutPublicoHorarioFechamento? }`
  - Observacao: `padraoNovoPedidoTipoCartao` so deve ser enviado quando `padraoNovoPedidoPagamento = CARTAO`.
  - Observacao: pelo menos um tipo de entrega e uma forma de pagamento devem permanecer habilitados no checkout publico.
  - Observacao: quando `checkoutPublicoEncomendaModo = FIXO`, `checkoutPublicoEncomendaDataFixa` passa a ser obrigatoria.
  - Observacao: quando `checkoutPublicoPagamentoCartao = true`, pelo menos uma opcao entre credito e debito deve permanecer habilitada.
  - Observacao: quando `checkoutPublicoHorarioAtivo = true`, `checkoutPublicoHorarioAbertura` e `checkoutPublicoHorarioFechamento` tornam-se obrigatorios no formato `HH:mm` e nao podem ser iguais.

Tenant:
- GET `/api/admin/tenant`
  - Observacao: alem de `isOpen`, agora tambem retorna `effectiveIsOpen`, `closureReason`, `scheduleEnabled`, `scheduleSummary`, `statusLabel` e `statusMessage` para o painel refletir o estado real da loja considerando horario automatico.
- PUT `/api/admin/tenant`
  - Body: `{ isOpen: boolean }`

Cupons:
- GET `/api/admin/cupons`
- POST `/api/admin/cupons`
  - Body: `{ codigo, tipo, valor, maxUsos, expiraEm? }`
  - Observacao: `valor` em centavos quando tipo = FIXO, ou percentual quando tipo = PERCENTUAL.
  - Observacao: `expiraEm` agora e opcional e deve ser enviado apenas como data (`YYYY-MM-DD`); em branco, o cupom fica sem expiracao.
- PUT `/api/admin/cupons/:id`
  - Body: `{ codigo?, tipo?, valor?, maxUsos?, expiraEm?, ativo? }`
  - Observacao: `expiraEm` segue a mesma regra do POST e pode ser limpo para deixar o cupom sem expiracao.
- DELETE `/api/admin/cupons/:id`
  - Observacao: falha se o cupom tiver usos > 0.

Clientes:
- GET `/api/admin/clientes?search=...`
- GET `/api/admin/clientes/:id`
- POST `/api/admin/clientes`
  - Observacao: se o telefone ja pertencer a outro cadastro, retorna conflito em vez de atualizar o cliente existente implicitamente.
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
