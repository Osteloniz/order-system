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
- O checkout publico continua com o mesmo fluxo, mas Pix e cartao podem seguir para o gateway configurado.

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

## Sem migration nesta etapa
- Nenhum arquivo em `prisma/schema.prisma` ou `prisma/migrations/` foi alterado.
- Nao existe migration para rodar localmente, em HML ou em PRD por causa desta integracao inicial do Mercado Pago.

## Teste manual sugerido
1. Configurar as variaveis acima no ambiente local/HML.
2. Subir a aplicacao.
3. Criar um pedido publico com `PIX`.
4. Confirmar se a pagina de confirmacao mostra o botao de pagamento.
5. Abrir o checkout do Mercado Pago.
6. Simular o pagamento com conta/cartao de teste.
7. Validar o retorno para `/confirmacao/:id`.
8. Confirmar se o webhook atualiza `statusPagamento` e o kanban/KDS.
9. Repetir com `cartao credito`.
10. Repetir com `cartao debito`, se essa opcao estiver habilitada no checkout publico.
