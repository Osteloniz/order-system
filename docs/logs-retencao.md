# Logs e Retencao

## Objetivo

O sistema agora separa melhor:

- `LogOperacao`: historico operacional do negocio
- `AuthAuditLog`: auditoria de autenticacao e convites
- `console` tecnico: apenas para desenvolvimento e falhas relevantes

## Estrategia adotada

### 1. Reducao de ruido novo

- logs de sucesso comuns deixaram de usar `console.log` solto
- agora eles passam por `appLogger`
- em producao, o nivel padrao fica mais restrito
- movimentacoes de estoque com variacao `0` nao geram mais `LogOperacao`

### 2. Retencao dos logs de banco

Retencao padrao:

- `LogOperacao`: `90 dias`
- `AuthAuditLog`: `180 dias`

Esses valores podem ser ajustados via ambiente:

```env
LOG_OPERATION_RETENTION_DAYS="90"
AUTH_AUDIT_RETENTION_DAYS="180"
```

## Variaveis de ambiente

```env
LOG_LEVEL="info"
ENABLE_OPERATION_LOGS="true"
LOG_OPERATION_RETENTION_DAYS="90"
AUTH_AUDIT_RETENTION_DAYS="180"
```

### Como funciona

- `LOG_LEVEL`
  - `debug`
  - `info`
  - `warn`
  - `error`

- `ENABLE_OPERATION_LOGS`
  - `true`: grava `LogOperacao`
  - `false`: desativa novas gravacoes de `LogOperacao`

Importante:

- `AuthAuditLog` continua ativo mesmo se `ENABLE_OPERATION_LOGS=false`
- nao recomendo desligar `AuthAuditLog`

## Script de limpeza

Foi criado o script:

```bash
npm run logs:cleanup
```

Por padrao, ele roda em **modo simulacao** e nao apaga nada.

Ele mostra:

- total atual de `LogOperacao`
- total atual de `AuthAuditLog`
- quantos registros seriam removidos
- data de corte usada

### Executar simulacao

```bash
npm run logs:cleanup
```

### Executar de verdade

PowerShell:

```powershell
$env:CONFIRM_CLEANUP_LOGS="LIMPAR_LOGS_PRD"
npm run logs:cleanup -- --execute
```

### Personalizar a retencao na execucao

```powershell
$env:CONFIRM_CLEANUP_LOGS="LIMPAR_LOGS_PRD"
npm run logs:cleanup -- --execute --operation-days=120 --auth-days=365
```

## Recomendacao de uso

Para o seu cenario:

- manter `LogOperacao` ligado
- manter `AuthAuditLog` ligado
- rodar limpeza periodica em homologacao antes
- depois aplicar em PRD de forma controlada

## Cenario recomendado para producao

- `LOG_LEVEL="warn"`
- `ENABLE_OPERATION_LOGS="true"`
- `LOG_OPERATION_RETENTION_DAYS="90"`
- `AUTH_AUDIT_RETENTION_DAYS="180"`

## Observacao importante

Se em algum momento voce sentir que o `LogOperacao` ainda cresce demais, o proximo passo ideal nao e apagar tudo.

O caminho certo seria:

1. revisar pontos que chamam `registrarLogOperacao`
2. agrupar eventos muito repetitivos
3. criar resumo diario para consulta executiva
4. manter o detalhe fino apenas pelo periodo de retencao
