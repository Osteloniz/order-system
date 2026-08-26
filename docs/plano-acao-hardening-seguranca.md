# Plano de Acao - Hardening de Seguranca

Data de registro: 27/07/2026
Status: Planejado para implementacao futura com janela dedicada de testes

## Objetivo

Registrar as ondas de endurecimento de seguranca identificadas na revisao recente, preservando o contexto para execucao posterior sem improviso e sem risco de perder os pontos priorizados.

Este plano foi separado da documentacao operacional atual para permitir implementacao com calma, validacao por cenarios reais e rollout seguro.

## Premissas

- Implementar por ondas pequenas para reduzir risco de regressao.
- Validar cada onda localmente antes de qualquer subida para HML/PRD.
- Evitar misturar este hardening com entregas operacionais do dia a dia.
- Priorizar protecoes que reduzam exposicao publica, abuso automatizado e vazamento de dados.

## Onda 1 - Correcoes criticas

### Meta

Reduzir as superficies mais expostas do fluxo publico sem quebrar checkout, consulta de pedido e operacao do admin.

### Escopo

1. Endurecer o acesso publico por telefone.
   - Remover o modelo em que o telefone sozinho libera historico e acesso sensivel.
   - Usar telefone apenas como identificador inicial.
   - Exigir um segundo fator simples para liberar pedidos do cliente.
   - Preparar o fluxo para codigo temporario, preferencialmente pensando em futura integracao com WhatsApp.

2. Fechar exposicao de PII nas respostas publicas.
   - Revisar respostas publicas para retornar apenas o minimo necessario.
   - Remover ou reduzir prefill sensivel quando nao houver verificacao forte.
   - Garantir que rotas publicas nao virem vetor de descoberta de dados de cliente.

3. Reduzir uso de token em URL.
   - Priorizar cookie HttpOnly nas rotas publicas de pedido.
   - Remover fallback por query/header onde ele nao for mais necessario.
   - No fluxo de convite admin, limpar a URL apos o primeiro consumo do token.
   - No retorno de pagamento, validar o token recebido e redirecionar sem mantelo exposto.

4. Completar protecao anti-clickjacking.
   - Manter `X-Frame-Options: DENY`.
   - Adicionar `Content-Security-Policy` com `frame-ancestors 'none'`.
   - Validar para nao impactar redirecionamentos externos de pagamento.

### Riscos

- Quebra no acesso aos pedidos recentes do cliente.
- Regressao no fluxo de confirmacao/retomada de pagamento.
- Regressao no convite admin se a limpeza de URL for feita cedo demais.

### Testes obrigatorios

- Cliente cria pedido e acessa a confirmacao normalmente.
- Cliente nao consegue descobrir pedidos apenas testando numeros de telefone.
- Prefill nao expoe dados sem validacao suficiente.
- Convite admin continua funcional do inicio ao fim.
- Redirecionamentos de Mercado Pago continuam funcionando.
- Headers de seguranca continuam presentes nas respostas.

## Onda 2 - Hardening estrutural

### Meta

Trocar protecoes parciais por mecanismos mais robustos e consistentes com ambiente real de deploy.

### Escopo

1. Migrar rate limit para armazenamento compartilhado.
   - Substituir `Map` em memoria por storage compartilhado.
   - Cobrir login admin, lookup publico, prefill, checkout e rotas de pagamento sensiveis.
   - Preservar mensagens genericas e tratamento seguro de abuso.

2. Revisar sessao admin e logout.
   - Reavaliar uso atual de JWT em sessao administrativa.
   - Definir se sera necessario mecanismo de revogacao server-side.
   - Garantir logout previsivel e seguro.

3. Auditar IDOR por rota.
   - Revisar rotas admin e publicas com `id` em path.
   - Confirmar autenticacao, escopo por `tenantId` e retorno neutro.

4. Auditar exposicao de dados internos.
   - Revisar `select`, `include` e serializadores.
   - Garantir que hashes, tokens, segredos e metadados internos nao escapem em JSON.

### Riscos

- Mudancas na camada de sessao exigirem ajuste em middleware e auth helpers.
- Rate limit distribuido gerar falso positivo se a calibragem estiver agressiva.

### Testes obrigatorios

- Login admin normal.
- Bloqueio por tentativas excessivas continua funcional.
- Logout continua encerrando a sessao corretamente.
- Nenhuma rota de admin cruza tenant indevidamente.
- Nenhuma resposta de API retorna campos internos sensiveis.

## Onda 3 - UX segura e observabilidade

### Meta

Melhorar a experiencia sem reabrir brechas de seguranca e deixar o sistema mais observavel para incidentes.

### Escopo

1. Recuperacao segura de pedidos do cliente.
   - Evoluir do modelo por telefone para telefone + codigo.
   - Preparar integracao futura com WhatsApp como segundo fator, se viavel financeiramente.

2. Convites admin com UX mais segura.
   - Melhorar fluxo visual sem manter token exposto alem do necessario.
   - Preservar mensagens genericas quando fizer sentido.

3. Observabilidade de seguranca.
   - Registrar tentativas de abuso, rate limit, falha de webhook e padroes suspeitos.
   - Evitar log de PII desnecessaria.

### Riscos

- UX ficar burocratica demais no publico.
- Excesso de logs gerar ruido sem utilidade operacional.

### Testes obrigatorios

- Fluxo de recuperacao continua simples para cliente real.
- Logs criticos aparecem quando esperado.
- Nenhum log novo expone segredo, token ou dado pessoal desnecessario.

## Ordem recomendada de execucao

1. Onda 1 completa.
2. Onda 2 com foco primeiro em rate limit distribuido.
3. Onda 2 com foco em sessao/logout e auditoria de IDOR.
4. Onda 3 para consolidacao da experiencia e monitoramento.

## Critérios de pronto por onda

### Onda 1

- Fluxo publico deixa de confiar apenas em telefone.
- Tokens em URL ficam restritos ao minimo necessario.
- Headers anti-clickjacking completos e validados.

### Onda 2

- Rate limit deixa de depender de memoria local.
- Sessao admin e logout ficam com comportamento definido e auditavel.
- Auditoria de IDOR e exposicao de dados concluida.

### Onda 3

- Recuperacao de pedido evoluida com fator adicional.
- Logs e observabilidade prontos para operacao.

## Checklist antes de implementar

- Separar branch exclusiva para hardening.
- Definir janela para testes manuais de cliente, admin e pagamentos.
- Confirmar ambiente HML com credenciais e webhooks de teste funcionais.
- Revisar se ha qualquer entrega de negocio em paralelo que possa conflitar com auth, middleware ou APIs publicas.

## Observacao final

Este documento existe para preservar o plano de forma objetiva. A implementacao deve acontecer apenas quando houver tempo para testes completos, principalmente nos fluxos publicos de pedido, convite admin, login, logout e pagamentos.
