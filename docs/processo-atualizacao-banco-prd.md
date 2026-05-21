# Processo De Atualizacao Do Banco Em PRD

Este documento descreve o processo recomendado para atualizar o banco de dados de producao com seguranca neste projeto.

Contexto atual:
- banco em `Neon`
- aplicacao em `Vercel`
- migrations com `Prisma`
- arquivo `.env` apontando para `homologacao`
- arquivo `.env.prod` apontando para `producao`

Objetivo:
- evitar subir codigo novo sem atualizar o banco corretamente
- reduzir risco de erro em producao
- manter um fluxo repetivel

## Regra Geral

Sempre que houver alteracao em qualquer um destes itens:

- `prisma/schema.prisma`
- pasta `prisma/migrations`
- codigo que depende de coluna, enum ou tabela nova

voce deve tratar a subida como uma mudanca de banco, nao apenas uma mudanca de codigo.

## Fluxo Recomendado

O fluxo ideal e este:

1. desenvolver localmente apontando para a branch de `homologacao` do Neon
2. rodar migrations em `homologacao`
3. validar tudo em homologacao
4. subir o codigo para o Git
5. atualizar o banco de producao
6. fazer o deploy em producao
7. validar a producao

## Antes De Subir Para PRD

Checklist minimo:

1. confirmar que o arquivo `.env` esta apontando para o banco de `homologacao`
2. rodar:

```bash
npx prisma generate
npx prisma migrate deploy
```

3. testar no minimo:
- login admin
- pedidos
- checkout
- relatorios
- financeiro, se a alteracao tocar nessa parte

4. confirmar que nao existem erros de build:

```bash
npm run build
```

## Como Saber Se Ha Mudanca De Banco

Voce deve considerar que ha alteracao de banco quando:

- criou migration nova
- alterou enum
- criou coluna nova
- criou tabela nova
- removeu ou renomeou campo

Exemplo real deste projeto:
- adicao de `tipoCartao`
- adicao de `ContaPagar`

Ambos exigem atualizacao do banco.

## Como Subir O Codigo

Quando tudo estiver validado:

```bash
git status
git add .
git commit -m "feat: descricao da alteracao"
git push origin main
```

## Importante Sobre A Vercel

Hoje este projeto **nao** esta configurado para rodar migration automaticamente no deploy.

No `package.json`, o fluxo atual nao executa `prisma migrate deploy` por conta propria no deploy de producao.

Isso significa que atualizar o banco e uma etapa separada e obrigatoria.

## Processo Correto Para Atualizar O Banco De Producao

### 1. Garantir Que Voce Tem A Conexao De PRD

Para atualizar producao, use as credenciais da branch de `producao` do Neon.

Nao use:
- a branch `homologacao`
- o arquivo `.env` local de testes

Neste projeto, o padrao atual e:
- `.env` para `HML`
- `.env.prod` para `PRD`

## Modelo Recomendado De Variaveis Em PRD

Exemplo:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST-POOLER/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://USUARIO:SENHA@HOST-DIRECT/neondb?sslmode=require&channel_binding=require"
```

Regra:
- `DATABASE_URL` com `pooler`
- `DIRECT_URL` sem `pooler`

## 2. Rodar A Migration Em PRD

Com o `.env.prod` configurado corretamente, use:

```bash
npm run db:migrate:prod:status
npm run db:migrate:prod
```

Esses comandos:
- carregam o `.env.prod`
- priorizam `DIRECT_URL`
- consultam/aplicam apenas o que estiver pendente

## 3. So Depois Disso Fazer O Deploy

Depois que a migration terminar sem erro, faca o deploy do codigo.

Se a Vercel estiver ligada na branch `main`, o deploy tende a acontecer automaticamente depois do push.

Se preferir controlar manualmente:
- rode a migration primeiro
- depois acione o deploy na Vercel

## Ordem Mais Segura

Para este projeto, a ordem mais segura e:

1. push do codigo
2. `prisma migrate deploy` em PRD
3. deploy da Vercel
4. validacao em producao

Se o deploy da Vercel acontecer automaticamente rapido demais, voce pode:
- deixar a migration pronta primeiro
- e entao fazer o push

O importante e nunca deixar producao com:
- codigo novo esperando coluna que ainda nao existe

## Como Validar Depois Da Migration

Depois de rodar `prisma migrate deploy`, faca estas validacoes:

```bash
npx prisma migrate status
```

O esperado e:
- nenhuma migration pendente

## Fluxo Automatico Recomendado

Para reduzir erro operacional neste projeto, use um arquivo local `.env.prod` com as credenciais da branch de `producao` do Neon.

Exemplo:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST-POOLER/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://USUARIO:SENHA@HOST-DIRECT/neondb?sslmode=require&channel_binding=require"
```

Com isso, o fluxo diario fica em apenas dois comandos:

### Consultar status das migrations em PRD

```bash
npm run db:migrate:prod:status
```

### Aplicar migrations em PRD

```bash
npm run db:migrate:prod
```

Esses comandos usam:
- `scripts/check-migrate-prod.ps1`
- `scripts/migrate-prod.ps1`

Ambos usam `.env.prod` por padrao e priorizam `DIRECT_URL` para falar com o banco de producao de forma segura.

## Fluxo Atual De HML

Hoje, o arquivo `.env` do projeto esta sendo usado para `homologacao`.

Para consultar se ha migration pendente em HML:

```bash
npx prisma migrate status
```

Para aplicar migrations em HML:

```bash
npx prisma migrate deploy
```

Se quiser regenerar o client depois:

```bash
npx prisma generate
```

Depois valide na aplicacao:
- login admin
- rota principal `/admin`
- relatorios
- criacao de pedido
- qualquer tela afetada pela migration

## Exemplo Real Baseado No Projeto

Suponha que vamos subir estas alteracoes:

- `tipoCartao` no pedido
- modulo financeiro
- tabela `ContaPagar`

Fluxo recomendado:

### Em homologacao

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Testar:
- pedido com `Credito`
- pedido com `Debito`
- relatorios
- contas a pagar
- fluxo de caixa

### Em producao

```bash
npm run db:migrate:prod:status
npm run db:migrate:prod
```

Depois:
- deploy na Vercel
- validar admin
- validar pedidos
- validar relatorios

## O Que Nunca Fazer

Evite estes erros:

- rodar migration de producao usando a branch `homologacao`
- fazer deploy do codigo sem aplicar a migration
- mudar `schema.prisma` e esquecer de criar migration
- testar direto em producao sem passar na branch de homologacao

## Como Fazer Rollback Se Der Problema

### Problema So No Codigo

Se o banco ficou correto, mas a interface ou regra quebrou:

```bash
git log --oneline
git revert <hash-do-commit>
git push origin main
```

Depois redeployar.

### Problema De Banco

Se a migration causou problema real nos dados:

- usar recursos do Neon para branch/restauracao
- avaliar restauracao com muito cuidado

Na maioria dos casos, o melhor caminho nao e “desfazer no escuro”, mas:
- corrigir com uma nova migration

## Checklist Rapido De PRD

Sempre que houver mudanca de banco, siga esta lista:

1. validou em `homologacao`
2. confirmou build local
3. confirmou env de producao correto
4. rodou:

```bash
npm run db:migrate:prod:status
npm run db:migrate:prod
```

5. confirmou com:

```bash
npm run db:migrate:prod:status
```

6. fez deploy na Vercel
7. validou a aplicacao em producao

## Processo Enxuto Para O Dia A Dia

Se quiser o resumo em poucas linhas:

### Homologacao

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run dev
```

### Producao

```bash
npm run db:migrate:prod:status
npm run db:migrate:prod
```

Depois:
- deployar na Vercel
- validar o sistema

## Observacao Final

Neste projeto, o banco deve ser tratado como parte da entrega.

Sempre que existir migration nova:
- homologar antes
- atualizar producao com `prisma migrate deploy`
- e so entao considerar a entrega concluida
