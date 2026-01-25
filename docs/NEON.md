# Neon + Prisma (setup inicial)

Ultima atualizacao: 2026-01-25

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

## 3) Instalar dependencias
```bash
npm install
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

Para esta etapa (frete por distancia + cupons), rode:
```bash
npx prisma migrate dev --name add-frete-cupons
```

## 6) Testar conexao
1. Rode o projeto:
```bash
npm run dev
```
2. Abra:
```
/api/health/db
```
Se retornar `{ "ok": true }`, a conexao esta ativa.

## 7) Configuracao inicial (seed)
Opcional: inserir 1 registro em `Configuracao` e algumas categorias/produtos.
Para rodar o seed:
```bash
npx prisma db seed
```

Depois do seed, atualize no admin:
- Latitude/Longitude do estabelecimento
- Regras de frete (base/raio/km excedente)
