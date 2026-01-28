# Multi-tenant (empresas separadas)

Este projeto agora suporta várias empresas usando as mesmas tabelas, separadas por `tenantId`.

## Como funciona
- Cada empresa é um `Tenant`.
- Cada admin pertence a um `Tenant` (`AdminUser`).
- Todas as tabelas principais (configuração, categorias, produtos, cupons, pedidos) guardam `tenantId`.
- O painel Admin sempre filtra pelo `tenantId` do usuário logado.
- O público escolhe a empresa e isso gera um cookie `tenant_slug` (sem login).

## Passos para configurar
1) Rode as migrations:
```
npx prisma migrate dev
```

2) Rode o seed para criar as empresas e o admin padrão:
```
SEED_ADMIN_PASSWORD=admin123 npx prisma db seed
```

## Acesso do Admin
- URL: `/admin/login`
- Escolha a empresa
- Usuário: `admin`
- Senha: valor de `SEED_ADMIN_PASSWORD` usado no seed

## Abrir/fechar pedidos
No painel Admin em **Configurações** existe o toggle **Aberto para pedidos**.
Quando fechado:
- o front exibe aviso
- o backend bloqueia novos pedidos

## Migrando dados existentes (importante)
Se você já tinha dados antes do multi-tenant, defina o `tenantId` nas linhas antigas.

1) Pegue o `tenantId`:
```
SELECT id, nome, slug FROM "Tenant";
```

2) Aplique o `tenantId` nas tabelas existentes (exemplo):
```
UPDATE "Configuracao" SET "tenantId" = '<TENANT_ID>' WHERE "tenantId" IS NULL;
UPDATE "Categoria" SET "tenantId" = '<TENANT_ID>' WHERE "tenantId" IS NULL;
UPDATE "Produto" SET "tenantId" = '<TENANT_ID>' WHERE "tenantId" IS NULL;
UPDATE "Cupom" SET "tenantId" = '<TENANT_ID>' WHERE "tenantId" IS NULL;
UPDATE "Pedido" SET "tenantId" = '<TENANT_ID>' WHERE "tenantId" IS NULL;
```

> Dica: use o Neon Console ou um client SQL para rodar esses comandos.
