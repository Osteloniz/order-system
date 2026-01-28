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

## 3) Migrations em producao
Em producao use:
```bash
npx prisma migrate deploy
```

## 4) Seed (opcional)
Se precisar criar tenants e admin em producao:
```bash
SEED_ADMIN_PASSWORD=uma_senha_forte npx prisma db seed
```

## 5) Build/Deploy
- Fazer push no Git.
- Vercel vai buildar automaticamente.

## 6) Validacoes
- Acessar `/api/health/db` e verificar `{ "ok": true }`.
- Testar fluxo de pedido (menu -> checkout -> confirmacao).
- Testar admin (login, cupons, config).
- Validar que empresas nao veem dados uma da outra.
