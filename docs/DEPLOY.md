# Deploy Checklist (Vercel + Neon)

Ultima atualizacao: 2026-01-25

## 1) Git
- Nao commitar `.env`.
- Manter `.env.example` com placeholders.

## 2) Vercel - Environment Variables
Configurar no projeto:
- `DATABASE_URL` (pooler do Neon)
- `DIRECT_URL` (conexao direta do Neon)
- `ADMIN_PASSWORD`

## 3) Migrations em producao
Em producao use:
```bash
npx prisma migrate deploy
```

## 4) Build/Deploy
- Fazer push no Git.
- Vercel vai buildar automaticamente.

## 5) Validacoes
- Acessar `/api/health/db` e verificar `{ "ok": true }`.
- Testar fluxo de pedido (menu -> checkout -> confirmacao).
- Testar admin (login, cupons, config).

