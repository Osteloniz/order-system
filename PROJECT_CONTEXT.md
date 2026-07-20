# Project Context

## What This Project Is
- Online order system for food/confectionery operations.
- Customer-facing menu and checkout plus an admin backoffice.
- Built with Next.js App Router, React 19, Prisma, and Postgres/Neon.
- The current visual direction is a cleaner operational palette with off-white surfaces, strong dark text, and a blue-lavender accent family led by `#5B6CFA`.

## Current Product Shape
- Customer flow: tenant selection -> menu -> cart -> checkout -> confirmation.
- Admin flow: login -> orders -> production, stock, finance, customers, and configuration.
- Authentication uses NextAuth credentials.
- Database uses Prisma over Postgres with production-oriented migration scripts.
- Local development is expected to run on Node.js `22.22.3`.
- Products can now be manually marked as `novidade` in admin so the public menu can highlight them in a dedicated section without removing them from their normal categories.
- Product availability now also depends on stock plus `disponivelParaEncomenda`: with stock the sale is normal, without stock the item can become `somente encomenda`, and without both it must be blocked from checkout.
- Stock operations now use a batch production-entry flow in admin: the operator informs one total produced amount and must split it across flavors with an exact sum match before saving.
- The batch production-entry UX is now exposed directly on `admin/producao` through a single modal launcher, and the history date grouping there uses the Sao Paulo date key to avoid `Invalid Date`.
- Stock and production were then consolidated into a single canonical admin screen at `admin/estoque`; `admin/producao` now exists only as a compatibility redirect, and the batch modal there should stay list-based with per-flavor checkbox enablement for mobile safety.
- Public checkout now has a secure Asaas-hosted online payment foundation: the order is created first in the local system, online payments use Asaas Checkout plus Webhooks for confirmation, and the old Mercado Pago fields were replaced by explicit Asaas payment fields.
- The online-payment layer is gateway-configurable and now defaults operationally to Mercado Pago through `ONLINE_PAYMENT_GATEWAY=MERCADO_PAGO`, while Asaas remains supported for legacy links and controlled fallback without adding a new migration in this phase.
- Public order intake now also supports a daily automatic open-hours window on top of the manual store toggle: manual close still wins, but when the schedule is enabled the menu and checkout must respect the configured Sao Paulo time range automatically.
- In the current Mercado Pago shape, card payments still use Checkout Pro, while Pix now uses the direct payment API as the primary flow, exposing QR Code plus copy-paste data in the public confirmation without depending on hosted checkout login.
- The direct Mercado Pago Pix payload was hardened again: its technical payer email is now derived from a short safe hash instead of the raw external reference, avoiding invalid local-parts and length issues that could make Pix creation fail even when card checkout still works.
- Mercado Pago status synchronization no longer depends only on the webhook: the public return route can now also reconcile the payment by `payment_id` after a successful Checkout Pro redirect, reducing the chance of a paid order staying visually pending when the async notification lags or fails.
- Public payment callbacks no longer need to carry the order access token to Asaas; a separate hashed return token is used for the gateway redirect, and the confirmation page then rotates back to a normal public order token.
- Public order access was hardened again: new orders now persist access through an order-scoped `HttpOnly` cookie instead of exposing the token in the confirmation URL or keeping it in localStorage; header/query token input remains only as a compatibility path for controlled transitions.
- Legacy orders without `publicAccessTokenHash` no longer auto-bootstrap a new public token on first anonymous access; that transition now fails closed and may require an explicit operational recovery path if old data still exists.
- Tenant resolution now only falls back to the default tenant when there is no tenant cookie at all; an invalid tenant cookie must fail closed instead of silently opening the default tenant context.
- Customer self-cancellation remains available only for non-online-payment orders; orders tied to an active Asaas checkout must be handled by the store to avoid payment/order divergence.
- Local sandbox validation for Asaas now also depends on a public `APP_URL` for callback acceptance; localhost callbacks are rejected by Checkout creation, so tunnel-based testing (for example Cloudflare Quick Tunnel) must update both the webhook target and the local `APP_URL`.
- The public checkout must not offer Pix through Asaas Checkout when the authenticated Asaas account has no active Pix key; the menu and order-creation flow now verify this capability and hide/block Pix automatically.
- The customer-facing flow should now follow the device/system theme by default, but still without exposing a manual theme switch in the public experience.
- The public menu, tenant picker, cart and checkout now consume one shared effective store status contract, so any future change to opening-hours logic must keep those entry points aligned with the same helper instead of duplicating local checks.
- Payment recovery now has a safer operational path: the public confirmation screen can resume the current Asaas checkout or request a renewed link, while the admin kanban can copy, revalidate, and resend payment links via WhatsApp using the same server-side checkout guard.
- To avoid duplicate charges, the system now reuses an active hosted checkout whenever possible and blocks payment-method switches while an online link is still active; switching methods becomes possible again after expiration or when no reusable checkout remains.
- The admin kanban now also has a payment-linked intermediate status `PRONTO_ENTREGA`: in-stock orders can jump there directly after payment approval, while `PREPARACAO` is now mainly the real production stage for `ENCOMENDA`; if approval is reverted before delivery, regular orders fall back to `ACEITO` and `ENCOMENDA` falls back to `PREPARACAO`.
- The admin now also has a dedicated KDS-style operational screen at `admin/kds`, focused on mobile/tablet execution. It reuses the same status, payment, and stock rules from the kanban instead of creating a second workflow.
- This KDS groups the work into quick operational lanes (`FEITO`, `ACEITO`, `PREPARACAO`, `PRONTO_ENTREGA`), keeps a separate future `ENCOMENDA` agenda, highlights pending online payments, and exposes one-tap actions for payment confirmation and status progression.
- Hosted Asaas checkouts must now reflect the saved order total exactly, including manual promotional discounts, coupons, and freight; when an open online order is edited in admin and that payment composition changes, the previous hosted-link state is invalidated locally so the next generated link uses the new amount instead of reusing stale checkout data.
- For the new HML Mercado Pago path, security takes priority over convenience: while a pending Mercado Pago link is still active, the admin now blocks risky edits that would change amount, items, or relevant payer data and could leave an older valid charge circulating outside the system.
- Stock commitment for public availability now follows a stricter rule: common online orders reserve stock as soon as payment is approved, common cash orders reserve stock once the store accepts them, and delivery is still the moment of definitive baixa; `ENCOMENDA` keeps reserving on production-oriented statuses (`PREPARACAO` / `PRONTO_ENTREGA`).
- Payment-driven status changes now also pass through the same stock synchronization path used by manual kanban status changes, so webhook approval, manual payment confirmation, and payment-method switches can reserve or release stock consistently.
- The Asaas webhook logic now prioritizes the actual payment status returned by the charge lookup when deciding `statusPagamento` and automatic status progression, instead of depending only on the webhook event name. This hardens PRD against cases where the event label is generic but the charge is already approved.
- Public menu and checkout now also subtract a shadow map of committed-but-not-yet-reserved orders as a safety net, preventing oversell even if older open orders still have stale stock timestamps from before this rule was tightened.
- This availability safety net is now stricter for checkout concurrency: recent public `FEITO` orders also create a temporary shadow hold for a short window, and the public order-creation transaction now re-locks stock rows plus revalidates availability before persisting the order, reducing the chance that two customers capture the same last unit simultaneously.
- Cash (`DINHEIRO`) orders now receive an explicit visual highlight in the admin kanban to make the non-online commitment path easier to spot during operation.
- Public customer recovery is no longer primarily device-bound: the `Seus ultimos pedidos` block now searches the server by phone, rate-limits lookup attempts, and grants public follow-up access through a signed customer cookie tied to tenant + phone instead of relying only on local device history.
- This phone-based public recovery is intentionally transitional: it must stay limited to minimal order data and remain ready for a future stronger verification step such as WhatsApp code confirmation.
- Product lifecycle now also distinguishes temporary public unavailability from true discontinuation:
  - `ativo = false` means the item stays visible in the public menu as unavailable and blocked.
  - `descontinuado = true` means the item disappears from the public menu and from new product selections, but remains in history.
- Manual admin order entry now lists all non-discontinued products, even if they are temporarily unavailable in the public catalog.
- Direct customer CRUD is now stricter about duplicate phones: creating a new customer with an existing phone returns a conflict instead of silently overwriting the existing record.

## Important Business Areas
- Orders: creation, status updates, cancellation, payment status, delivery or pickup, scheduled `ENCOMENDA`.
- Stock and production: reservation, release, stock adjustments, and production logs.
- Finance: cash flow, accounts receivable, accounts payable, financial categories, and structured financial suppliers for payable accounts.
- Customers: customer history, gift tracking (`mimosEntregues`), phone, and WhatsApp data.
- Loyalty rule: every 14 cookies purchased generates 1 `mimo`, and each delivered `mimo` should be accounted for as stock output without creating receivables.
- Coupons and configuration: discount validation, store settings, and WhatsApp message templates.
- Coupons now accept an optional expiration date in admin: the UI uses date-only input, leaving it blank means "sem expiracao", and the backend preserves that behavior without requiring a schema migration in this phase.

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
- The stock-aware menu flow also adds Prisma field `Produto.disponivelParaEncomenda`.
- Migration created: `20260715143000_add_produto_disponivel_para_encomenda`.
- The Asaas payment foundation replaces the old Mercado Pago columns in `Pedido`, adds explicit Asaas checkout/payment fields plus `AsaasWebhookEvent`, and creates migration `20260715193000_add_asaas_checkout_integration`.
- The payment-linked kanban improvement adds Prisma enum value `StatusPedido.PRONTO_ENTREGA` and creates migration `20260715213000_add_pedido_pronto_entrega_status`.
- The product catalog/discontinuation refinement adds Prisma field `Produto.descontinuado` and creates migration `20260716113000_add_produto_descontinuado_flag`.
- Before HML/PRD validation or deploy of this feature line, apply the migration and regenerate Prisma Client.
- Supporting local sandbox scripts now include `scripts/asaas-sandbox-webhook.mjs` for webhook sync, `scripts/asaas-checkout-smoke.mjs` for direct checkout capability tests, and `scripts/asaas-pix-key.mjs` to inspect or create a sandbox Pix key when needed.
- Mercado Pago HML instructions now live in `docs/hml-mercado-pago-checkout-pro.md`, including the env switch, webhook secret, the Pix QR/copy-paste path, and the no-migration note for this phase.
- The automatic public-hours control adds Prisma fields `Configuracao.checkoutPublicoHorarioAtivo`, `Configuracao.checkoutPublicoHorarioAbertura`, and `Configuracao.checkoutPublicoHorarioFechamento`, with migration `20260719193000_add_public_checkout_hours_to_configuracao`.
- The admin kanban now also shows the active hosted-payment gateway badge (`Asaas` or `Mercado Pago`) on cards and in the order detail sheet, and it now exposes an admin-only checkout summary block so operations can quickly see which provider is being used and how many online payments are pending.

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
