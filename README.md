# Order System

Sistema de pedidos com cardapio, carrinho e area administrativa. Projeto em Next.js
com backend via API routes e banco Postgres (Neon) usando Prisma.

## Funcionalidades
- Catalogo com categorias e produtos por loja (tenant)
- Carrinho e fluxo de pedido
- Area administrativa (pedidos, produtos, categorias, cupons, configuracoes)
- Selecao de loja no cliente + cookie de tenant
- Autenticacao admin com NextAuth (credentials)

## Stack
- Next.js 16 (App Router)
- React 19
- Tailwind CSS
- SWR + Radix UI
- Prisma + Postgres (Neon)
- NextAuth (credentials)

## Como rodar
1) Instale as dependencias:

```bash
npm install
# ou
pnpm install
```

2) Configure o `.env` (base no `.env.example`):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
NEXTAUTH_SECRET="sua-chave-forte"
NEXTAUTH_URL="http://localhost:3000"
SEED_ADMIN_PASSWORD="admin123"
```

3) Rode as migrations e o seed:

```bash
npx prisma migrate deploy
npx prisma db seed
```

4) Suba o ambiente de desenvolvimento:

```bash
npm run dev
# ou
pnpm dev
```

5) Acesse:
```
http://localhost:3000
```

## Scripts
- `dev`: ambiente de desenvolvimento
- `build`: build de producao
- `start`: inicia o build
- `lint`: lint do projeto
- `prisma db seed`: popula dados iniciais no banco
- `vercel-build`: prisma generate + next build

## Estrutura (principais pastas)
- `app/`: rotas e paginas
- `components/`: componentes de UI e paginas
- `contexts/`: contextos de estado
- `lib/`: utilitarios e dados mockados
- `public/`: assets e imagens
- `docs/`: PRD, API e modelo de dados
- `prisma/`: schema Prisma
- `scripts/`: scripts auxiliares (deploy/migrations)

## Fluxo Admin
- Acesse `/admin/login`
- Selecione a loja (tenant), usuario e senha
- Painel carregara dados apenas do tenant autenticado

## Fluxo Cliente
- Na home selecione a loja
- O tenant fica salvo em cookie
- Para trocar, use o botao "Trocar loja" no topo do cardapio

## Observacoes
- Para configurar Neon + Prisma, veja `docs/NEON.md`.
- Checklist de deploy: `docs/DEPLOY.md`.
