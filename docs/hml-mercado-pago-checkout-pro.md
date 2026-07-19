# HML Mercado Pago Checkout Pro

Data de referencia: `18/07/2026`

## Objetivo desta fase
- Validar o Mercado Pago `Checkout Pro` primeiro em HML/local.
- Manter PRD ainda no fluxo atual ate a troca ser aprovada.
- Evitar migration nova nesta etapa.

## O que foi implementado
- Selecao de gateway por variavel de ambiente.
- Suporte a `ASAAS` e `MERCADO_PAGO` na mesma camada de checkout hospedado.
- Novo webhook `POST /api/mercadopago/webhook`.
- Novo retorno publico `GET /pagamento/mercado-pago/:id`.
- Serializacao publica do pedido agora informa o gateway ativo em `pagamentoOnline.gateway`.
- O checkout publico continua com o mesmo fluxo, mas o comportamento agora pode divergir por metodo dentro do gateway configurado:
  - `CARTAO` no Mercado Pago continua via Checkout Pro.
  - `PIX` no Mercado Pago agora usa a API direta como fluxo principal.
  - A confirmacao publica deve mostrar `QR Code` e `codigo copia-e-cola` para Pix sem depender de login no Mercado Pago.
  - A trilha antiga de Checkout Pro para Pix ficou apenas como compatibilidade tecnica e nao deve ser considerada o fluxo principal desta fase.

## Variaveis de ambiente

Exemplo para HML com Mercado Pago:

```env
ONLINE_PAYMENT_GATEWAY="MERCADO_PAGO"
APP_URL="https://SUA-URL-PUBLICA"
NEXTAUTH_URL="https://SUA-URL-PUBLICA"
NEXT_PUBLIC_APP_URL="https://SUA-URL-PUBLICA"

MERCADO_PAGO_PUBLIC_KEY="..."
MERCADO_PAGO_ACCESS_TOKEN="..."
MERCADO_PAGO_WEBHOOK_SECRET="..."
```

Observacoes:
- `APP_URL` precisa ser publica para o retorno do checkout e para o webhook.
- Nao salvar credenciais reais no Git.
- Se quiser voltar rapidamente para o Asaas em HML, basta trocar:

```env
ONLINE_PAYMENT_GATEWAY="ASAAS"
```

## Regra operacional importante desta fase
- No Mercado Pago, o link hospedado e reaproveitado enquanto o pedido estiver pendente.
- Para nao correr risco de cobrar um valor antigo, pedidos com link pendente do Mercado Pago nao devem aceitar edicoes que mudem valor, itens ou contato relevante.
- Nesses casos, o backend bloqueia a edicao e orienta a finalizar ou trocar o pagamento primeiro.

## Observacao sobre credenciais do painel
- Para esse fluxo atual do backend, o essencial continua sendo:
  - `MERCADO_PAGO_ACCESS_TOKEN`
  - `MERCADO_PAGO_PUBLIC_KEY`
  - `MERCADO_PAGO_WEBHOOK_SECRET`
- `Client ID` e `Client Secret` do painel nao sao necessarios para esta integracao server-to-server com Checkout Pro + webhook + pagamento Pix direto.
- Essas chaves costumam entrar em cenarios OAuth ou apps com autorizacao delegada, o que nao e o caso aqui.

## Sem migration nesta etapa
- Nenhum arquivo em `prisma/schema.prisma` ou `prisma/migrations/` foi alterado.
- Nao existe migration para rodar localmente, em HML ou em PRD por causa desta integracao inicial do Mercado Pago.

## Teste manual sugerido
1. Configurar as variaveis acima no ambiente local/HML.
2. Subir a aplicacao.
3. Criar um pedido publico com `PIX`.
4. Confirmar se a pagina de confirmacao mostra o QR Code Pix e o codigo copia-e-cola quando o gateway ativo for Mercado Pago nesse metodo.
5. Validar se `REFRESH_LINK` atualiza o bloco de Pix sem quebrar o pedido.
6. Confirmar se o webhook atualiza `statusPagamento` e o kanban/KDS apos a aprovacao.
7. Repetir com `cartao credito`.
8. Repetir com `cartao debito`, se essa opcao estiver habilitada no checkout publico.
