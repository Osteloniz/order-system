# Caixa Express V1

## Operação

`/caixa/login` recebe a conta individual do operador. O MASTER cria e desativa contas em **Segurança → Acessos do Caixa** com MFA. MASTER e ADMIN autenticados abrem o Caixa a partir da navegação interna.

Em **Nova venda**, selecione produtos, meio e situação do pagamento. Para **Receber depois**, busque o telefone e vincule o cliente. A criação mínima preserva o cadastro quando o telefone já existe e exige confirmação do vínculo. Uma venda paga pode usar **Cliente balcão**. A confirmação mostra o número curto. O pedido nasce entregue, dá baixa física uma vez e fica no histórico interno.

Em **Pendências**, confira a venda, o valor integral e o meio efetivo antes de confirmar. O meio efetivo pode ser diferente do previsto. Em **Gerenciar venda**, MASTER e ADMIN podem consultar pelo número e registrar correção, estorno, cancelamento de pendência ou devolução física. Correção, estorno, cancelamento e devolução exigem motivo. Estorno exige escolher entre reabrir a dívida e encerrar a venda. Reposição exige confirmar os itens aptos para venda.

## Competência e trilha

| Registro | Data usada |
| --- | --- |
| Venda e dívida aberta | Entrega, em America/Sao_Paulo |
| Recebimento e taxa | Instante efetivo no servidor |
| Correção de meio ou taxa | Instante efetivo do recebimento original, com trilha da correção |
| Saída por estorno | Instante do estorno no servidor |
| Devolução física | Instante da reposição no servidor |

O financeiro classifica a origem `LEGADO` com a regra antiga. Uma venda Caixa entregue em dinheiro pode permanecer prevista. Cada pagamento Caixa registra bruto, taxa e meio efetivo no evento. As visões calculam o líquido com base nesse evento. A saída de estorno registra o bruto devolvido. As taxas originais permanecem no histórico.

A fidelidade da venda Caixa é liberada após recebimento para cliente elegível. A classificação dos itens considera categorias de cookies e é gravada no item no momento da venda. Os itens internos identificados como brinde ou mimo são excluídos do catálogo Caixa, inclusive com preço simbólico. O cálculo histórico de origem legada é preservado. Reabertura ou encerramento por estorno retira a elegibilidade da venda e preserva mimos já entregues.

## Conexão e recuperação

Com resposta inconclusiva, use **Consultar tentativa** na mesma cesta, inclusive depois de entrar novamente com a mesma conta e tenant. A tentativa e a cesta são guardadas no dispositivo. Se a tentativa já foi gravada, a API devolve a venda original. Se ainda estiver ausente, a operação revalida preço e saldo e conclui com a mesma chave. Em conflito após receber na maquininha, encaminhe a ocorrência ao MASTER ou ADMIN com o número, se disponível, o valor e o meio antes de lançar ou cobrar novamente.

As migrations aditivas são `20261120120000_add_caixa_express_and_themes` e `20261120123000_snapshot_caixa_loyalty`. Novas vendas exigem `BROOKIE_CAIXA_NOVAS_VENDAS=true` no ambiente de teste. A versão V1 bloqueia novas vendas em execução Vercel de produção. Com vendas desativadas, o Caixa continua consultando e dando baixa nas pendências autorizadas. O MASTER pode desativar as contas operacionais para manter apenas a operação sob MFA.

Para recuperação, mantenha o schema e uma versão com leitura dos eventos e da origem Caixa. Um binário anterior que trata dinheiro entregue como realizado diverge das pendências de balcão. Ensaios de restauração devem usar uma branch isolada, identificar o ponto de recuperação e reconciliar vendas, pagamentos, ajustes, estoque e auditoria posteriores ao ponto restaurado.

## Validação

- Execute `npm run lint`, `npm run test:auth-security`, `npx tsc --noEmit` e `npm run build` no Node.js 22.22.3.
- Para executar `tests/caixa-express.integration.mjs`, inicie uma instância LOCAL apontada para o banco LOCAL ou HML com a flag de vendas ligada. Exporte `DATABASE_URL`, use `CAIXA_TEST_URL` se a porta diferir de 3411 e execute `node --experimental-strip-types tests/caixa-express.integration.mjs`. A suíte cria e remove dados sintéticos, testa dois tenants e restaura o tema anterior.
- Para a variante de navegador, aponte `CAIXA_PLAYWRIGHT_MODULE` para o módulo ESM de uma instalação de Playwright e, opcionalmente, `CAIXA_BROWSER_EXE` para o executável Chromium. A suíte percorre as combinações de tema e modo e conclui uma venda em viewport móvel.
- Para HML, use as evidências por critério da sessão de 20/11/2026 e complete a matriz de regressão e os ensaios da SPEC. Para liberar PRD, siga os §§20–21, incluindo aceite em HML, ensaio de recuperação, plano e região efetivos, operação na rede da loja, critérios de carga e contingência, PR aprovado e autorização explícita.
