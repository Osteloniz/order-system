# Brookie — Technical Handoff

This is a compact orientation guide. Source code, schema, migrations and the existing operational documents are included in this repository package.

## Stack and structure

- **Framework:** Next.js 16 with App Router and React 19.
- **Data:** Prisma 5 with PostgreSQL/Neon. `prisma/schema.prisma` is the source of truth and `prisma/migrations/` contains the history.
- **UI:** Tailwind CSS, Radix UI, React Hook Form, Zod, SWR and Recharts.
- **Authentication:** NextAuth v4 Credentials provider, JWT session and bcrypt password hashes.
- **Payments:** Mercado Pago is the current configurable default; Asaas remains implemented for hosted checkout and webhooks.

Main folders:

```text
app/          routes, pages, API handlers (Next App Router)
components/   public checkout/menu, admin screens, shared UI primitives
contexts/     cart and admin-auth client context
hooks/        responsive/UI hooks
lib/          business rules, auth, database, stock, payments and tenancy helpers
prisma/       Prisma schema, migrations and seed
public/       static/PWA assets
scripts/      production migration and operational scripts
tests/        focused security and loyalty tests
docs/         API, security, HML/PRD and business-operation documentation
```

There is no `src/` or legacy `pages/` folder. There is no `services/` folder: service/business logic lives in `lib/`. There is no committed `vercel.json`; Vercel uses the Next build script (`vercel-build`).

## Database and environment

- Environment variable names and safe placeholders are in `.env.example`.
- `.env` is HML/staging and `.env.prod` is PRD; neither is included in the shared package.
- Production migration scripts are in `scripts/check-migrate-prod.ps1` and `scripts/migrate-prod.ps1`.
- Core models: `Tenant`, `Configuracao`, `Produto`, `Pedido`, `ItemPedido`, `Cliente`, `ProdutoEstoque`, `ProducaoRegistro`, `Cupom`, finance models, `AdminUser`, invite/audit logs and `AsaasWebhookEvent`.

## Authentication and access

- `lib/auth.ts`: credentials login, bcrypt verification, rate limiting and audit logging; session contains user and tenant identity.
- `middleware.ts`: security headers, tenant-cookie behavior and admin-session protection.
- `lib/auth-helpers.ts`: server-side authorization helpers for protected admin routes.
- All authenticated administration is tenant-scoped by session. The current product operates as single-brand Brookie (`brookie-pregiato`).
- There is no application-level admin/operator role enum today: authenticated `AdminUser` accounts share the administrative panel. Public customers do not hold accounts; their order follow-up uses scoped access mechanisms.

## Public customer flow

1. Public entry/menu: `app/(cliente)/page.tsx` and `app/(cliente)/menu/page.tsx`.
2. Catalog: `components/menu/menu-page.tsx`, `product-card.tsx`, `cart-sheet.tsx`; data from `GET /api/menu`.
3. Cart state: `contexts/cart-context.tsx`.
4. Checkout: `components/checkout/checkout-page.tsx`, posting to `POST /api/pedidos`.
5. Confirmation and payment recovery: `app/(cliente)/confirmacao/[id]/page.tsx`, `components/checkout/confirmation-page.tsx`, and payment routes/webhooks.

Public checkout honors store state/hours, product availability/stock, coupon rules, delivery/payment configuration and payment-gateway state.

## Internal order flow

- Screen: `app/admin/(protected)/novo-pedido/page.tsx`.
- Main form: `components/admin/novo-pedido-page.tsx`.
- API: `POST /api/admin/pedidos`; dashboard and status handling are in `components/admin/pedidos-dashboard.tsx`, `GET /api/admin/pedidos`, `PATCH /api/admin/pedidos/[id]`, `/status` and `/pagamento`.
- The internal flow can register customer details, products/items, delivery mode, payment, discounts/coupon, internal notes, responsible party and scheduled orders. Stock and finance effects are synchronized by the domain helpers under `lib/`.

## Key API groups

- Public: `/api/menu`, `/api/pedidos`, `/api/pedidos/[id]`, `/api/pedidos/recentes`, `/api/clientes/prefill`, `/api/cupons/validar`.
- Admin catalogue/customer/order: `/api/admin/produtos`, `/categorias`, `/clientes`, `/pedidos`, `/producao`, `/kds`, `/config`.
- Finance/admin support: `/api/admin/financeiro/*`, `/fornecedores-financeiros`, `/categorias-financeiras`, `/relatorios`, `/logs`, `/invites`.
- Authentication and platform: `/api/auth/[...nextauth]`, invitation routes, `/api/health/db`, tenant routes.
- Payments: `/api/asaas/webhook`, `/api/mercadopago/webhook`, plus public and admin payment routes.

The complete route inventory is `docs/API.md`.

## High-value source examples

- Admin order form: `components/admin/novo-pedido-page.tsx`.
- Admin operational order board: `components/admin/pedidos-dashboard.tsx`.
- Public menu: `components/menu/menu-page.tsx`.
- Public checkout: `components/checkout/checkout-page.tsx`.

## Important business rules

- Monetary values are persisted as integer cents.
- Product lifecycle: `ativo=false` keeps it visible but unavailable; `descontinuado=true` removes it from new public selection.
- Availability is stock-aware, including order reservations and checkout concurrency protection.
- Common orders reserve stock when advancing from `FEITO`; delivery performs the final stock reduction. `ENCOMENDA` has production-oriented reservation behavior.
- Statuses: `FEITO`, `ACEITO`, `PREPARACAO`, `PRONTO_ENTREGA`, `ENTREGUE`, `CANCELADO`.
- Loyalty: every 14 cookies purchased earns one `mimo`; delivery consumes stock without creating receivables.
- Review `PROJECT_CONTEXT.md` before changing payments, stock, tenant behavior, public access or dates.

## Known attention points

- **Authorization granularity:** all `AdminUser` accounts use the same functional access; separate admin/operator permissions would require design and enforcement across APIs, not just UI changes.
- **Complex domains:** stock reservation, payment callbacks, public access and tenant resolution are cross-cutting. Preserve existing helpers rather than reimplementing logic in routes/components.
- **Payments:** two gateway paths and asynchronous webhooks require idempotent handling and HML validation before PRD.
- **Mobile operations:** admin production/stock/KDS flows are intentionally mobile-aware; visual changes need real viewport validation.
- **Database rollout:** schema/migration changes follow local → HML → validation → approved PR → PRD. Never run a PRD migration without explicit user approval after HML acceptance.

For deeper context, start with `PROJECT_CONTEXT.md`, `SECURITY_AUTH.md`, `docs/API.md`, `docs/DEPLOY.md` and `docs/processo-atualizacao-banco-prd.md`.
