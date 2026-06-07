# Deploy Checklist (Vercel + Neon)

Ultima atualizacao: 2026-01-27

## 1) Git
- Nao commitar `.env`.
- Manter `.env.example` com placeholders.

## 2) Vercel - Environment Variables
Configurar no projeto:
- `DATABASE_URL` (pooler do Neon)
- `DIRECT_URL` (conexao direta do Neon)
- `NEXTAUTH_SECRET` (gerar uma string aleatoria)
- `NEXTAUTH_URL` (URL do projeto na Vercel)
- `SEED_ADMIN_PASSWORD` (opcional, usado no seed)

## 3) Build command
No projeto, o build ja inclui Prisma:
- `pnpm run vercel-build` (prisma generate + next build)

## 4) Migrations em producao
Em producao use:
```bash
npx prisma migrate deploy
```

## 5) Seed (opcional)
Se precisar criar tenants e admin em producao:
```bash
SEED_ADMIN_PASSWORD=uma_senha_forte npx prisma db seed
```

## 6) Build/Deploy
- Fazer push no Git.
- Vercel vai buildar automaticamente.

## 6.1) Fluxo Operacional Recomendado
- Implementar e validar localmente.
- Se houver mudanca de banco, aplicar primeiro em HML e validar apontando o ambiente local para HML.
- Atualizar documentacao relevante antes do push.
- Fazer push no Git somente depois da validacao.
- Se houver mudanca de banco, atualizar PRD com `npm run db:migrate:prod:status` e `npm run db:migrate:prod`.
- Validar PRD apos o deploy.

## 6.2) Quando Nao Ha Mudanca De Banco
Nao e necessario atualizar PRD no banco quando a entrega mexe apenas em:
- componentes visuais
- filtros e comportamento de interface
- rotas/API sem dependencia de coluna, enum ou tabela nova
- documentacao
- contexto operacional (`AGENTS.md`, `PROJECT_CONTEXT.md`)

## 7) Validacoes
- Acessar `/api/health/db` e verificar `{ "ok": true }`.
- Testar fluxo cliente (selecionar loja -> cardapio -> checkout -> confirmacao).
- Testar fluxo admin (login -> pedidos/produtos/categorias/cupons/config).
- Validar que empresas nao veem dados uma da outra.
