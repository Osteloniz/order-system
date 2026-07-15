# Project Context

## What This Project Is
- Online order system for food/confectionery operations.
- Customer-facing menu and checkout plus an admin backoffice.
- Built with Next.js App Router, React 19, Prisma, and Postgres/Neon.

## Current Product Shape
- Customer flow: tenant selection -> menu -> cart -> checkout -> confirmation.
- Admin flow: login -> orders -> production, stock, finance, customers, and configuration.
- Authentication uses NextAuth credentials.
- Database uses Prisma over Postgres with production-oriented migration scripts.
- Local development is expected to run on Node.js `22.22.3`.
- Products can now be manually marked as `novidade` in admin so the public menu can highlight them in a dedicated section without removing them from their normal categories.

## Important Business Areas
- Orders: creation, status updates, cancellation, payment status, delivery or pickup, scheduled `ENCOMENDA`.
- Stock and production: reservation, release, stock adjustments, and production logs.
- Finance: cash flow, accounts receivable, accounts payable, financial categories, and structured financial suppliers for payable accounts.
- Customers: customer history, gift tracking (`mimosEntregues`), phone, and WhatsApp data.
- Loyalty rule: every 14 cookies purchased generates 1 `mimo`, and each delivered `mimo` should be accounted for as stock output without creating receivables.
- Coupons and configuration: discount validation, store settings, and WhatsApp message templates.

## Key Technical Files
- `app/`: routes, pages, and API handlers.
- `components/`: customer and admin UI.
- `lib/`: business logic helpers.
- `prisma/schema.prisma`: source of truth for domain entities.
- `PROMPTINICIAL.md`: cross-chat continuity prompt, expected working style, and update rule for future conversations.
- `docs/API.md`: route inventory.
- `docs/admin-mobile-order-flow-handoff.md`: current admin mobile UX decisions, validation workflow, cleanup notes, and next-chat handoff.
- `SECURITY_AUTH.md`: auth and invite rules.

## Domain Notes
- `Pedido` is the central entity and links customers, items, coupon snapshots, payment, delivery, and stock events.
- `Tenant` still exists in the schema, even though some flows operate like a single-brand system.
- Delivery types include `ENTREGA`, `RETIRADA`, `RESERVA_PAULISTANO`, and `ENCOMENDA`.
- Legacy admin session routes are documented as deactivated; current auth is NextAuth-based.
- `ContaPagar` keeps a legacy `fornecedor` text field for compatibility, but new work should prefer the structured `FornecedorFinanceiro` registry and relation.

## Production Bug Triage Checklist
1. Reproduce the issue locally or identify the failing route or component.
2. Check whether the bug touches auth, tenant resolution, stock reservation, payment status, or date handling.
3. Inspect the API route, related `lib/` helper, and Prisma model together before patching.
4. Validate with the smallest relevant command: `build`, `lint`, or a targeted test or script.
5. Call out migration or data backfill needs explicitly if a fix changes persistence behavior.

## Release Workflow
1. Implement locally.
2. If database structure changed, apply migrations in HML first.
3. Validate locally against HML.
4. Update documentation and project context before shipping.
5. Push code to Git.
6. If database structure changed, run PRD migration flow.
7. Validate PRD after deploy.

## Current Migration Notes
- The product-highlight feature adds Prisma field `Produto.novidade`.
- Migration created: `20260715110000_add_produto_novidade_flag`.
- Before HML/PRD validation or deploy of this feature line, apply the migration and regenerate Prisma Client.

## Current Exceptions And Defaults
- `Fluxo de caixa` and `Relatorios` intentionally keep week-based default periods.
- Generic operational date filters now default to current month start through today.

## Fast Prompt For Future Chats
Use something like:

`Leia AGENTS.md, PROJECT_CONTEXT.md e docs/admin-mobile-order-flow-handoff.md. Estamos corrigindo um bug em producao: <descreva o sintoma>.`

That is usually enough to rehydrate context quickly.

For higher continuity across longer workstreams, prefer starting from `PROMPTINICIAL.md`.

## Commands I'll Commonly Use
- `rtk npm run dev`
- `rtk npm run build`
- `rtk npm run lint`
- `rtk npm run test:auth-security`
