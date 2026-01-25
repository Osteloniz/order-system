# PRD - Order System

Ultima atualizacao: 2026-01-25

## 1) Visao geral
Sistema de pedidos com menu para clientes e painel administrativo para operacao. O MVP atual roda com dados mockados em rotas internas e fluxo completo de pedido.

## 2) Objetivo
- Permitir que clientes escolham itens do menu, fechem pedido e recebam confirmacao.
- Permitir que o admin acompanhe pedidos e gerencie produtos, categorias e configuracoes.
- Preparar a base para persistencia em Postgres (Neon) com Prisma.

## 3) Usuarios e personas
- Cliente: navega no menu, adiciona itens ao carrinho e finaliza pedido.
- Admin/Operador: autentica e gerencia pedidos e catalogo.

## 4) Fluxos principais
Cliente:
1. Menu -> escolhe produtos por categoria.
2. Carrinho -> revisa itens e subtotal.
3. Checkout -> informa dados, entrega/retirada e pagamento.
4. Confirmacao -> recebe numero do pedido.

Admin:
1. Login -> acesso ao painel protegido.
2. Pedidos -> lista e atualiza status (feito > aceito > preparacao > entregue).
3. Cancelamento -> admin informa motivo e o pedido vai para CANCELADO.
4. Produtos -> cria, edita, ativa/inativa.
5. Categorias -> cria, edita e ordena.
6. Configuracoes -> frete fixo, endereco retirada, nome do estabelecimento.

## 5) Requisitos funcionais (MVP)
Cliente:
- Listar categorias e produtos ativos.
- Adicionar/remover itens do carrinho e ajustar quantidade.
- Calcular subtotal, frete e total.
- Criar pedido com snapshot de itens.
- Mostrar confirmacao do pedido.

Admin:
- Autenticacao por senha.
- Listar pedidos e filtrar por status.
- Atualizar status do pedido.
- CRUD basico de categorias e produtos.
- Atualizar configuracoes do estabelecimento.

## 6) Regras de negocio
- Frete aplicado apenas para entrega.
- Frete por distancia: ate X km cobra frete base; acima disso soma valor por km excedente.
- Distancia e informada manualmente pelo cliente.
- CEP auto-preenche endereco via ViaCEP (cliente pode ajustar os campos).
- Pedido deve ter ao menos 1 item.
- Telefone e nome sao obrigatorios.
- Endereco de entrega obrigatorio quando tipo = ENTREGA.
- Status do pedido segue ordem: FEITO -> ACEITO -> PREPARACAO -> ENTREGUE.
- Cancelamento exige motivo e mantem historico.
- Exclusao definitiva apenas para pedidos CANCELADOS.
- Cupom: apenas 1 por pedido, com expiracao e limite de usos.
- Produtos com itens de pedido nao podem ser excluidos.
- Categorias com produtos nao podem ser excluidas.
- Itens do pedido salvam snapshot de nome e preco no momento da compra.

## 7) Nao-funcionais
- UI responsiva (mobile-first para cliente).
- Admin protegido por cookie de sessao.
- Performance: menu deve carregar rapido em rede movel.
- Observabilidade basica via logs de rotas.

## 8) Dados e entidades (alto nivel)
- Categoria, Produto, Pedido, ItemPedido, Configuracao.
- Ver detalhes em `docs/DB.md`.

## 9) Integracoes e stack
- Next.js + React + Tailwind + SWR.
- Banco alvo: Postgres (Neon) + Prisma.

## 10) Metricas (iniciais)
- Taxa de conversao (menu -> pedido).
- Tempo medio do pedido (feito -> entregue).
- Numero de pedidos por dia.

## 11) Escopo futuro (pos-MVP)
- Usuarios admin com roles.
- Historico de clientes por telefone.
- Relatorios e exportacao.
- Pagamentos integrados.
