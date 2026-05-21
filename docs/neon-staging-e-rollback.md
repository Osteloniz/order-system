# Neon Staging E Rollback

Este documento registra o fluxo recomendado para testar alteracoes do sistema com seguranca antes de subir para producao.

Contexto atual deste projeto:
- Banco em producao no `Neon`
- Aplicacao em producao na `Vercel`
- ORM e migrations com `Prisma`
- Sistema em uso real, com pedidos e clientes ativos

Objetivo:
- testar alteracoes em uma copia segura do banco
- evitar quebrar a producao
- ter um plano claro de rollback

## Visao Geral

O fluxo recomendado para este projeto e:

1. criar uma branch de `staging` no Neon a partir da branch de producao
2. apontar o ambiente local para essa branch
3. rodar migrations e validar as alteracoes nessa branch
4. somente depois subir o codigo para a `main` e para a Vercel
5. se algo der errado, voltar o codigo e corrigir antes de tocar em producao novamente

## Por Que Usar Branch No Neon

No Neon, a forma mais segura de testar nao e copiar o banco com `pg_dump` logo de inicio. O melhor caminho e usar o recurso nativo de `branch`.

Vantagens:
- rapido de criar
- parte do estado atual da producao
- nao interfere na branch principal
- permite testar migrations e regras reais
- ajuda muito em cenarios de restauracao

## Estrutura Recomendada

Sugestao de estrutura:

- `Neon branch main`: producao
- `Neon branch staging`: homologacao
- `Vercel producao`: ligada na branch Git principal e no banco de producao
- `localhost`: apontando temporariamente para a branch `staging`

Se quiser evoluir depois:
- criar tambem uma `Vercel staging`
- ligar essa Vercel de staging ao banco `staging`

## Passo A Passo Para Criar O Staging No Neon

### 1. Abrir o projeto no Neon

Entre no painel do Neon e abra o projeto usado por este sistema.

### 2. Criar uma branch nova

No menu de branches:
- clique para criar uma nova branch
- nome sugerido: `staging`
- use como origem a branch atual de producao, normalmente `main`

### 3. Criar um endpoint read-write

Depois da branch criada:
- crie um endpoint `read-write`
- esse endpoint sera usado pelo ambiente local ou por uma Vercel de homologacao

### 4. Copiar a connection string

Copie a connection string da branch `staging`.

Voce normalmente tera algo neste formato:

```env
DATABASE_URL="postgresql://usuario:senha@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://usuario:senha@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

Observacao:
- em alguns cenarios, `DATABASE_URL` pode usar pooler e `DIRECT_URL` a conexao direta
- mantenha o padrao que ja existe hoje no projeto

## Como Apontar O Localhost Para O Banco De Staging

No arquivo `.env` ou preferencialmente no `.env.local`, use as URLs da branch `staging`.

Exemplo:

```env
DATABASE_URL="URL_DA_BRANCH_STAGING"
DIRECT_URL="URL_DA_BRANCH_STAGING"
NEXTAUTH_URL="http://localhost:3000"
```

Depois rode:

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

## Checklist Antes De Testar

Antes de abrir a aplicacao local:

1. confirmar que `DATABASE_URL` aponta para a branch `staging`
2. confirmar que `DIRECT_URL` aponta para a branch `staging`
3. rodar `npx prisma generate`
4. rodar `npx prisma migrate deploy`
5. subir a aplicacao com `npm run dev`
6. limpar sessao local se o admin estiver com dados antigos em cache

## Exemplo Real Baseado No Projeto Atual

Suponha que hoje queremos testar estas alteracoes:

- suporte a `tipoCartao` com `Credito` e `Debito`
- novo modulo financeiro com:
  - `Contas a receber`
  - `Fluxo de caixa`
  - `Contas a pagar`
- ajuste de filtros e periodo padrao nos relatorios

Esse conjunto mexe em:
- telas
- APIs
- schema Prisma
- migrations

Ou seja, **nao e uma alteracao segura para testar direto em producao**.

Fluxo recomendado para esse caso:

1. criar a branch `staging` no Neon
2. apontar o `.env.local` para a branch `staging`
3. rodar:

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

4. validar manualmente:
- login admin
- dashboard de pedidos
- checkout com `Cartao > Credito`
- checkout com `Cartao > Debito`
- checkout com `Encomenda`
- relatorios com periodo semanal
- financeiro:
  - contas a receber
  - fluxo de caixa
  - contas a pagar

5. se tudo estiver correto:
- fazer commit
- push
- deploy em producao

## O Que Testar Em Staging

Para este sistema, o ideal e validar pelo menos:

### Pedidos

- criar pedido no menu
- criar pedido manual no admin
- alterar status
- confirmar pagamento
- verificar se pedidos de dias anteriores continuam visiveis quando estiverem em aberto

### Checkout

- `PIX`
- `Cartao > Credito`
- `Cartao > Debito`
- `Dinheiro`
- `Retirada`
- `Entrega Reserva Paulistano`
- `Encomenda`

### Relatorios

- periodo padrao da semana
- busca com botao
- totais filtrados
- total na tabela de sabores

### Financeiro

- contas a receber preenchidas a partir dos pedidos
- fluxo de caixa cruzando entradas e saidas
- criar conta a pagar
- editar conta a pagar
- excluir conta a pagar

## Como Subir Para Producao Depois

Depois de validar em `staging`:

1. garantir que o codigo esta commitado
2. garantir que a branch `main` contem a versao validada
3. subir para o Git remoto
4. deixar a Vercel fazer o deploy
5. garantir que a migration rode em producao

Comandos comuns:

```bash
git status
git add .
git commit -m "feat: descricao da alteracao"
git push origin main
```

## Rollback: O Que E Possivel Fazer

Sim, rollback e possivel nesta estrutura.

Mas ele acontece em camadas diferentes.

### 1. Rollback De Codigo

Se o problema estiver no frontend, backend ou regra de negocio:
- volte o commit
- suba uma nova versao

Exemplo:

```bash
git log --oneline
git revert <hash-do-commit>
git push origin main
```

Esse e o rollback mais seguro quando o banco continua compativel.

### 2. Rollback De Banco No Neon

No Neon, voce pode usar restauracao por tempo ou branch a partir de um ponto anterior.

Isso ajuda quando:
- uma migration fez algo indevido
- dados foram alterados de forma incorreta
- voce precisa recuperar um estado anterior

Importante:
- rollback de banco deve ser feito com muita cautela
- isso pode afetar dados gerados depois da mudanca

### 3. Rollback De Migration

Aqui mora o maior cuidado.

Em producao, nem sempre o melhor caminho e “desfazer” a migration anterior.
Frequentemente o mais seguro e:

- manter a migration aplicada
- criar uma nova migration corrigindo o problema

Exemplo:
- foi criada uma coluna errada
- em vez de reverter direto na base de producao, cria-se uma nova migration ajustando a estrutura

## Estrategia De Rollback Recomendada Para Este Projeto

Fluxo recomendado:

1. testar tudo antes em `staging`
2. subir para producao apenas depois da validacao
3. se der problema:
- primeiro reverter o codigo
- depois avaliar se o banco realmente precisa de restauracao
- evitar rollback destrutivo de banco sem necessidade

## Quando O Banco Precisa Mesmo De Restauracao

Exemplos de alto risco:

- migration removeu coluna importante
- dados foram sobrescritos incorretamente
- processo automatico alterou muitos pedidos reais

Exemplos de baixo risco:

- bug visual
- filtro mostrando dados errados
- texto incorreto na interface
- card ou tela quebrada

Nestes casos, normalmente basta rollback de codigo.

## Boas Praticas Para Este Projeto

- nunca testar migration nova direto na branch de producao do Neon
- sempre validar primeiro em `staging`
- manter commits pequenos e descritivos
- evitar juntar muitas mudancas sensiveis em um unico deploy
- se houver duvida, criar uma branch nova de banco e testar outra vez

## Resumo Rapido

Use sempre este raciocinio:

1. mudar codigo
2. testar no banco `staging` do Neon
3. validar localmente
4. subir para `main`
5. deployar em producao
6. se der problema:
- reverter codigo primeiro
- restaurar banco so se realmente necessario

## Proximo Passo Sugerido

Quando voltar a trabalhar nisso:

1. criar a branch `staging` no Neon
2. copiar as URLs dessa branch
3. apontar o `.env.local` para ela
4. rodar migrations
5. testar todo o fluxo antes de qualquer deploy em PRD
