# DB - Modelo de dados (proposta Postgres)

Ultima atualizacao: 2026-01-25

Observacao: este modelo reflete as entidades atuais do sistema e prepara a migracao para Neon + Prisma.

## Enums
- status_pedido: FEITO | ACEITO | PREPARACAO | ENTREGUE | CANCELADO
- tipo_pagamento: PIX | DINHEIRO | CARTAO
- tipo_entrega: ENTREGA | RETIRADA
- tipo_cupom: FIXO | PERCENTUAL

## Tabelas

### configuracoes
Armazena uma unica linha (singleton).
- id (uuid, pk)
- nome_estabelecimento (text, not null)
- endereco_retirada (text, not null)
- frete_base (int, not null) -- centavos
- frete_raio_km (numeric, not null)
- frete_km_excedente (int, not null) -- centavos por km
- estabelecimento_lat (numeric, not null)
- estabelecimento_lng (numeric, not null)
- criado_em (timestamp, not null, default now)
- atualizado_em (timestamp, not null)

### categorias
- id (uuid, pk)
- nome (text, not null)
- ordem (int, not null)
- criado_em (timestamp, not null, default now)
- atualizado_em (timestamp, not null)

### produtos
- id (uuid, pk)
- nome (text, not null)
- descricao (text, null)
- categoria_id (uuid, fk -> categorias.id)
- preco (int, not null) -- centavos
- ativo (boolean, not null, default true)
- imagem_url (text, null)
- imagens (text[], null)
- ordem (int, not null)
- criado_em (timestamp, not null, default now)
- atualizado_em (timestamp, not null)

Index sugerido:
- produtos(categoria_id)
- produtos(ativo)

### pedidos
- id (uuid, pk)
- status (status_pedido, not null)
- cliente_nome (text, not null)
- cliente_telefone (text, not null)
- pagamento (tipo_pagamento, not null)
- tipo_entrega (tipo_entrega, not null)
- endereco_entrega (text, null)
- endereco_retirada (text, not null)
- frete (int, not null)
- subtotal (int, not null)
- total (int, not null)
- motivo_cancelamento (text, null)
- distancia_km (numeric, null)
- desconto_valor (int, null)
- cupom_codigo_snapshot (text, null)
- cupom_id (uuid, null)
- criado_em (timestamp, not null, default now)
- atualizado_em (timestamp, not null)

Index sugerido:
- pedidos(cliente_telefone)
- pedidos(status)
- pedidos(criado_em)

### itens_pedido
- id (uuid, pk)
- pedido_id (uuid, fk -> pedidos.id)
- produto_id (uuid, fk -> produtos.id)
- nome_produto_snapshot (text, not null)
- preco_unitario_snapshot (int, not null)
- quantidade (int, not null)
- total_item (int, not null)

Index sugerido:
- itens_pedido(pedido_id)

### cupons
- id (uuid, pk)
- codigo (text, unique, not null)
- tipo (FIXO | PERCENTUAL)
- valor (int, not null) -- centavos ou percentual
- ativo (boolean, not null)
- expira_em (timestamp, not null)
- max_usos (int, not null)
- usos (int, not null)
- criado_em (timestamp, not null, default now)
- atualizado_em (timestamp, not null)

## Relacoes
- categoria 1..n produto
- pedido 1..n itens_pedido
- produto 1..n itens_pedido
- cupom 1..n pedidos (opcional)

## Observacoes de migracao
- Manter snapshot no itens_pedido para preservar historico.
- Separar configuracoes em tabela unica.
