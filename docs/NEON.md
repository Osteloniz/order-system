# Neon + Prisma (setup inicial)

Ultima atualizacao: 2026-01-28

## 1) Criar projeto no Neon
1. Crie um projeto no Neon (Postgres).
2. Copie a string de conexao do banco.
3. O Neon fornece 2 strings:
   - Pooler (recomendada para runtime)
   - Direct (recomendada para migrations)

## 2) Configurar variaveis de ambiente
1. Copie `.env.example` para `.env`.
2. Preencha:
   - `DATABASE_URL` com a string do pooler.
   - `DIRECT_URL` com a string direta (sem pooler).
   - `NEXTAUTH_SECRET` com uma chave forte (necessario para o login admin).
   - `NEXTAUTH_URL` com a URL do projeto (local ou Vercel).
   - `SEED_ADMIN_PASSWORD` (opcional) para definir a senha inicial do admin.

## 3) Instalar dependencias
```bash
npm install
# ou
pnpm install
```

## 4) Gerar Prisma Client
```bash
npx prisma generate
```

## 5) Criar a primeira migration
```bash
npx prisma migrate dev --name init
```

Se voce adicionar campos/enum novos (ex: CANCELADO), rode uma nova migration:
```bash
npx prisma migrate dev --name add-cancelamento
```

## 6) Aplicar migrations em producao
```bash
npx prisma migrate deploy
```

## 7) Testar conexao
1. Rode o projeto:
```bash
npm run dev
```
2. Abra:
```
/api/health/db
```
Se retornar `{ "ok": true }`, a conexao esta ativa.

## 8) Configuracao inicial (seed)
Opcional: inserir tenants, configuracoes e dados iniciais.
Para rodar o seed:
```bash
npx prisma db seed
```

Depois do seed, atualize no admin:
- Latitude/Longitude do estabelecimento
- Regras de frete (base/raio/km excedente)
