# Checklist Historico de Go-Live PRD com Dominio e Asaas

## Importante
- Este documento e historico, referente ao plano de subida com Asaas em `17/07/2026`.
- Ele nao representa mais o gateway online principal atual, que hoje esta direcionado para Mercado Pago.
- Manter apenas como referencia operacional antiga; nao usar como checklist padrao da fase atual sem revisar o contexto mais novo em `PROMPTINICIAL.md`, `PROJECT_CONTEXT.md` e `docs/hml-mercado-pago-checkout-pro.md`.

Data de referencia: `17/07/2026`

## Estado atual antes da virada
- PRD continua intacta neste momento.
- O PR `#7` ainda nao foi aprovado/mergeado.
- Nenhuma migration desta frente foi rodada em PRD ainda.
- O deploy novo ainda nao foi publicado em producao.
- O dominio `.com.br` ainda esta em configuracao de DNS.

## Objetivo deste guia
Subir com seguranca a frente de:
- checkout online com Asaas
- regras novas de estoque/reserva/disponibilidade
- status `PRONTO_ENTREGA`
- KDS
- ajustes de produtos/clientes/menu
- nova base visual

Sem perder cadastros, pedidos ou historico ja existentes em PRD.

## Ordem segura de execucao
1. Esperar o `Registro.br` liberar a edicao da zona DNS.
2. Configurar o dominio na Vercel e validar SSL.
3. Ajustar variaveis de ambiente de producao na Vercel.
4. Aprovar e mergear o PR `#7`.
5. Publicar a nova versao em producao.
6. Rodar as migrations em PRD.
7. Configurar o webhook do Asaas apontando para o dominio final.
8. Validar fim a fim em producao.

## Etapa 1: DNS no Registro.br
Quando a zona DNS estiver liberada, criar estes registros:

### Dominio raiz
- Tipo: `A`
- Nome: `@` ou vazio, conforme o painel permitir
- Valor: `216.198.79.1`

### Subdominio www
- Tipo: `CNAME`
- Nome: `www`
- Valor: `ed14d2136804f181.vercel-dns-017.com`

Observacoes:
- Nao usar `CNAME` no dominio raiz.
- Nao criar `A` para `www`.
- Se o Registro.br aceitar ponto final no valor do `CNAME`, tambem pode usar `ed14d2136804f181.vercel-dns-017.com.`

## Etapa 2: Confirmar dominio na Vercel
Depois de salvar o DNS:
1. Aguardar a propagacao.
2. Voltar na Vercel.
3. Confirmar que os dois dominios ficaram validos:
   - `brookiepregiato.com.br`
   - `www.brookiepregiato.com.br`
4. Manter `www.brookiepregiato.com.br` como URL oficial recomendada.
5. Manter o redirecionamento `brookiepregiato.com.br -> www.brookiepregiato.com.br`.

## Etapa 3: Variaveis de producao na Vercel
Atualizar o ambiente de producao com:

```env
APP_URL="https://www.brookiepregiato.com.br"
NEXTAUTH_URL="https://www.brookiepregiato.com.br"
NEXT_PUBLIC_APP_URL="https://www.brookiepregiato.com.br"

ASAAS_ENV="production"
ASAAS_API_KEY="SUA_CHAVE_DE_API_DE_PRODUCAO"
ASAAS_WEBHOOK_TOKEN="UM_TOKEN_FORTE_GERADO_POR_VOCE"
ASAAS_CHECKOUT_EXPIRY_MINUTES="60"
```

E manter tambem os segredos ja usados pelo sistema, como:
- `NEXTAUTH_SECRET`
- `ADMIN_ACCESS_KEY`
- `TOKEN_PEPPER`
- `DATABASE_URL`
- `DIRECT_URL`

Observacoes:
- `APP_URL`, `NEXTAUTH_URL` e `NEXT_PUBLIC_APP_URL` devem usar a URL final real.
- `ASAAS_ENV` em PRD deve ser `production`.
- `ASAAS_API_KEY` deve ser a chave de producao do Asaas, nao sandbox.
- Se a chave do Asaas comecar com `$`, manter entre aspas no `.env`.

## Etapa 4: Aprovar e mergear o PR
PR atual:
- `#7`
- URL: `https://github.com/Osteloniz/order-system/pull/7`

Antes do merge:
1. Revisar o PR.
2. Confirmar que o dominio ja esta definido ou muito proximo de ficar valido.
3. Confirmar que as variaveis de PRD ja estao preparadas.
4. Fazer o merge.

## Etapa 5: Publicar a aplicacao
Depois do merge:
1. Acompanhar o deploy automatico da Vercel, se estiver habilitado.
2. Se nao houver deploy automatico, disparar o deploy manual de producao.
3. Conferir se a versao publicada ja responde no dominio final.

## Etapa 6: Rodar migrations em PRD
Rodar no ambiente de producao:

```bash
npx prisma migrate deploy
```

Se o ambiente exigir regeneracao explicita do client:

```bash
npx prisma generate
```

## Migrations desta entrega
- `20260715143000_add_produto_disponivel_para_encomenda`
- `20260715193000_add_asaas_checkout_integration`
- `20260715213000_add_pedido_pronto_entrega_status`
- `20260716113000_add_produto_descontinuado_flag`

## Garantia de seguranca sobre dados
- Estas migrations nao apagam clientes, pedidos, produtos ou cadastros operacionais.
- A migration do Asaas foi ajustada para nao apagar os campos legados do Mercado Pago no banco.
- O sistema deixa de usar o legado, mas os dados antigos permanecem preservados em PRD.

## Etapa 7: Configurar Asaas em producao
No painel web do Asaas:

### Gerar/obter chave de API
- Caminho: `Integracoes > Chave de API`
- Usar uma chave de producao

### Criar webhook
- Caminho: `Menu do usuario > Integracoes > Webhooks`
- URL: `https://www.brookiepregiato.com.br/api/asaas/webhook`
- Token: exatamente o mesmo valor usado em `ASAAS_WEBHOOK_TOKEN`
- Status: ativo

### Validar Pix
- Confirmar que a conta de producao possui uma chave Pix ativa
- Sem chave Pix ativa, o sistema vai esconder/bloquear Pix no checkout

## Etapa 8: Validacao em PRD
Executar este checklist depois do deploy e das migrations:

### Dominio
- Abrir `https://www.brookiepregiato.com.br`
- Confirmar SSL/cadeado valido
- Confirmar redirecionamento correto do dominio sem `www`

### Menu e checkout
- Abrir menu publico
- Confirmar carregamento dos produtos
- Criar um pedido de teste

### Pagamento online
- Gerar link de pagamento
- Confirmar redirecionamento para checkout hospedado do Asaas
- Confirmar retorno para o sistema apos sucesso/cancelamento/expiracao

### Webhook e status
- Confirmar que pagamento aprovado atualiza o pedido
- Confirmar reflexo no kanban
- Confirmar reflexo no KDS

### Estoque e reserva
- Confirmar reserva/liberacao conforme regra atual
- Confirmar que produtos indisponiveis/encomenda respeitam o fluxo novo

## Se algo der errado
1. Nao rode alteracoes extras no banco sem revisar.
2. Verifique primeiro:
   - dominio e SSL
   - variaveis de ambiente
   - webhook do Asaas
   - logs da Vercel
   - logs do app
3. Se o webhook nao estiver entregando, revisar URL, token e fila no painel do Asaas.

## Resumo curto de execucao
1. Liberou DNS -> configurar `A` e `CNAME`
2. Vercel validou dominio
3. Ajustar `.env` de PRD
4. Mergear PR `#7`
5. Publicar producao
6. Rodar `npx prisma migrate deploy`
7. Configurar webhook do Asaas
8. Validar fluxo completo
