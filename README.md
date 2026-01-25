# Order System

Sistema de pedidos com cardapio, carrinho e area administrativa. Projeto em Next.js
com dados mockados via rotas de API internas.

## Funcionalidades
- Catalogo com categorias e produtos
- Carrinho e fluxo de pedido
- Area administrativa (produtos, categorias e configuracoes)
- Rotas de API internas para simulacao de dados

## Stack
- Next.js
- React
- Tailwind CSS
- SWR
- Radix UI
- Prisma (planejado)
- Postgres (Neon)

## Como rodar
1) Instale as dependencias:

```bash
npm install
# ou
pnpm install
```

2) Suba o ambiente de desenvolvimento:

```bash
npm run dev
# ou
pnpm dev
```

3) Acesse:
```
http://localhost:3000
```

## Scripts
- `dev`: ambiente de desenvolvimento
- `build`: build de producao
- `start`: inicia o build
- `lint`: lint do projeto
- `prisma db seed`: popula dados iniciais no banco

## Estrutura (principais pastas)
- `app/`: rotas e paginas
- `components/`: componentes de UI e paginas
- `contexts/`: contextos de estado
- `lib/`: utilitarios e dados mockados
- `public/`: assets e imagens
- `docs/`: PRD, API e modelo de dados
- `prisma/`: schema Prisma
- `scripts/`: scripts auxiliares (deploy/migrations)

## Observacoes
- Os dados sao mockados nas rotas de `app/api/`.
- Para configurar Neon + Prisma, veja `docs/NEON.md`.
- Checklist de deploy: `docs/DEPLOY.md`.
