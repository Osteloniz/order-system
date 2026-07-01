# Guia Git

## Regra deste projeto
- Neste ambiente, rode os comandos com `rtk`.
- Entre primeiro na pasta do projeto:

```bash
cd C:\SystemOrder\order-system
```

## Como ver as branches

### Branch atual
```bash
rtk git branch --show-current
```

### Branches locais
```bash
rtk git branch
```

### Branches locais e remotas
```bash
rtk git branch -a
```

### Branches remotas
```bash
rtk git branch -r
```

## Como saber qual e a branch principal
Use:

```bash
rtk git remote show origin
```

Neste repositorio, a branch principal atual e:

```bash
main
```

Voce confirma isso olhando a linha:

```bash
HEAD branch: main
```

## Fluxo mais seguro para trabalhar

### 1. Ir para a principal
```bash
rtk git switch main
```

### 2. Atualizar a principal
```bash
rtk git pull --ff-only origin main
```

### 3. Criar uma branch nova
Exemplo:

```bash
rtk git switch -c feat/nome-da-sua-entrega
```

Sugestoes de nome:
- `feat/admin-mobile-visual-pass`
- `fix/estoque-dark-theme`
- `hotfix/pagamento-prd`

### 4. Ver o que mudou
```bash
rtk git status --short
```

### 5. Adicionar so os arquivos corretos
Exemplo:

```bash
rtk git add components/admin/clientes-page.tsx
rtk git add components/admin/cupons-page.tsx
rtk git add PROMPTINICIAL.md
```

Se quiser adicionar tudo que foi alterado:

```bash
rtk git add .
```

Use isso com cuidado.

### 6. Revisar o que esta staged
```bash
rtk git diff --cached
```

Resumo rapido:

```bash
rtk git diff --cached --stat
```

### 7. Criar o commit
Exemplo:

```bash
rtk git commit -m "feat: improve admin mobile screens"
```

### 8. Subir a branch
Exemplo:

```bash
rtk git push -u origin feat/nome-da-sua-entrega
```

## Como abrir o PR
Depois do `push`, o GitHub normalmente devolve um link no terminal.

Se nao aparecer, voce pode abrir o repositorio no GitHub e criar o PR manualmente:
- base: `main`
- compare: sua branch nova

## Como continuar trabalho em uma branch que ja existe
```bash
rtk git switch nome-da-branch
rtk git pull
```

## Como voltar para a principal
```bash
rtk git switch main
```

## Como apagar uma branch local depois que terminou
Troque primeiro para `main`:

```bash
rtk git switch main
```

Depois apague:

```bash
rtk git branch -d nome-da-branch
```

Se tambem quiser apagar no remoto:

```bash
rtk git push origin --delete nome-da-branch
```

## Como trabalhar quando ja existem mudancas locais
Se voce ja alterou arquivos e ainda nao criou a branch, pode fazer assim:

```bash
rtk git switch -c feat/nome-da-sua-entrega
```

Isso cria a branch nova carregando as mudancas atuais.

## Comandos mais usados no dia a dia
```bash
rtk git status --short
rtk git branch --show-current
rtk git branch -a
rtk git diff
rtk git diff --cached
rtk git log --oneline --decorate -n 10
```

## Cuidados importantes
- Nao use `git add .` sem revisar se existem arquivos fora do escopo.
- Sempre rode `rtk git diff --cached` antes do commit.
- Prefira 1 branch por entrega.
- Se houver mudanca em banco, valide HML antes de pensar em PRD.
- Se estiver em duvida sobre o que vai entrar no commit, use `rtk git status --short`.
