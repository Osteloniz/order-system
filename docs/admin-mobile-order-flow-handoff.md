# Admin Mobile Order Flow Handoff

## Objective Of This Iteration
- Remodel the admin order experience with a mobile-first mindset.
- Keep the business flow intact while reducing clicks and visual noise.
- Allow mobile and desktop to diverge in component composition when that improves usability.
- Avoid introducing new business rules unless explicitly requested.

## Collaboration And Delivery Method
- Start by reading local project context and inspecting the affected code before changing anything.
- Optimize for fewer taps, faster order entry, clearer hierarchy, and "app-like" behavior on mobile.
- Preserve the system objective first; visual changes cannot break stock, payment, delivery, or order lifecycle rules.
- When there is ambiguity with business impact, pause and ask; when there is only implementation ambiguity, decide and document.
- Deliver end-to-end in this order:
  1. Inspect context and map dependencies.
  2. Implement the UI/data change.
  3. Validate with `lint`, `build`, and targeted tests.
  4. Apply database migration in HML when schema changes exist.
  5. Update docs/context before preparing PR/PRD.
- Never run PRD database migration without explicit user confirmation after HML validation is accepted.

## What Changed

### 1. New Manual Order Flow
- The admin new-order page was remodeled into a mobile-first two-step flow: `Catalogo` and `Finalizar`.
- The client area now uses focused actions instead of redundant input blocks:
  - `Buscar cliente`
  - `Cadastrar`
- Delivery and payment were simplified for speed:
  - card payment is chosen directly as `Cartao credito` or `Cartao debito`
  - the delivery type now also supports a saved default from configuration
- The following sections became collapsible to reduce visual overload:
  - `Descontos`
  - `Observacoes`
  - `Responsavel e etiquetas`
- The mobile footer action bar was rebuilt to avoid width breakage and label overflow.

### 2. Settings For New Manual Orders
- The configuration screen now defines defaults for:
  - default delivery type for new manual orders
  - default payment method for new manual orders
  - default card type when payment is card
  - default expanded/collapsed state for the optional order sections
- The delivery defaults added are:
  - `Condominio`
  - `Retirada`
  - `Encomenda`

### 3. Dashboard, Kanban And Order Detail Identity
- The top area of `Pedidos` was redesigned for mobile with a stronger action hierarchy.
- Summary cards were made more resilient on smaller widths.
- Kanban columns were adjusted to behave better with horizontal scroll on mobile.
- The order detail sheet/drawer was remodeled to match the new UI identity:
  - cleaner summary hero
  - grouped operational actions
  - fewer duplicated actions
  - clearer payment block
  - clearer item and service context
  - sensitive actions isolated from routine actions

### 4. Mobile Navigation And Reports
- The mobile header/menu was aligned to the left-side opening behavior.
- `Cadastros` was moved up in menu order and `Configuracoes` kept at the end.
- Reports filters and action buttons were reorganized so they do not break on mobile.

### 5. Quality And Validation Setup
- ESLint was installed and configured with a flat config compatible with the current Next.js setup.
- The lint configuration was tuned to stay useful without forcing risky repo-wide refactors unrelated to this delivery.
- Warnings were cleaned until `lint` finished without errors.

## Database Changes

### Existing migrations from this feature line
- `20260629190000_add_default_payment_to_configuracao`
- `20260629194000_add_novo_pedido_section_defaults_to_configuracao`
- `20260630010000_add_default_delivery_to_configuracao`

### New configuration field
- Prisma model: `Configuracao.padraoNovoPedidoEntrega`
- Type: `TipoEntrega`
- Default: `RESERVA_PAULISTANO`

### Migration Status
- HML: applied successfully.
- PRD: pending and must only run after explicit user confirmation.

## Validation Performed
- `rtk npm --prefix order-system run lint`
- `rtk npm --prefix order-system run build`
- `rtk npm --prefix order-system run test:auth-security`
- `rtk npx prisma migrate deploy --schema prisma/schema.prisma` in HML
- `rtk npx prisma generate --schema prisma/schema.prisma`

## Prisma Note On Windows
- If `prisma generate` fails on Windows with DLL lock (`EPERM` on `query_engine-windows.dll.node`), stop the running `node` / `next dev` processes first and retry the normal command.
- Do not use `rtk npx prisma generate --schema prisma/schema.prisma --no-engine` for local app runtime validation.
- `--no-engine` can generate a client that behaves like Accelerate/data-proxy mode and may fail local queries with `P6001` asking for `prisma://`.

## Repository Cleanup Done

### Removed
- `check-db.js`
  - Legacy root debug script, not referenced by package scripts, code, or docs.
- `reset-db.js`
  - Legacy root destructive helper, not referenced by package scripts, code, or docs.
- generated local artifacts:
  - `.dev-server.err.log`
  - `.dev-server.out.log`
  - `tsconfig.tsbuildinfo`

### Intentionally Kept
- `middleware.ts`
  - Still active in the app even though Next warns about future `proxy` convention.
- `pnpm-lock.yaml`
  - Kept to avoid removing potentially useful team tooling state.
- `types.d.ts`
  - Small compatibility declaration kept because it may still help local TS interoperability.
- `.next/`
  - Generated build output; not part of source control, but not removed as it can still be useful locally after validation.

## Files Most Relevant For Continuing This Work
- `components/admin/novo-pedido-page.tsx`
- `components/admin/pedidos-dashboard.tsx`
- `components/admin/admin-sidebar.tsx`
- `components/admin/relatorios-page.tsx`
- `components/admin/config-page.tsx`
- `app/api/admin/config/route.ts`
- `prisma/schema.prisma`
- `docs/API.md`

## Subsequent UI Passes After This Handoff
- The admin visual language was extended beyond the order flow into stock, production, clients, products, categories, coupons, accounts payable, accounts receivable, and cash flow.
- The current direction is still mobile-first, but without changing business rules or introducing new database requirements unless explicitly approved.
- Clients now use a denser list pattern for mobile scanning instead of oversized stacked cards.
- Accounts receivable and cash flow now have dedicated mobile card views so the experience does not depend on wide tables.
- A dedicated `admin/kds` screen now exists as a lighter execution surface for mobile/tablet operation, separate from the full kanban management screen.
- This continuation did not change `prisma/schema.prisma` or create new migrations.
- Before opening PR / preparing PRD, the next chat should prioritize final visual QA in local/HML and confirm user approval.

## Later Payment-Flow Continuity Notes

### Asaas Hosted Checkout Consistency
- The system now depends on Asaas hosted checkout for online payment continuity in both the public confirmation flow and the admin kanban.
- Hosted checkout generation must always mirror the persisted order total exactly:
  - item composition
  - freight
  - coupon discount
  - manual promotional discount
- Do not regress to generating hosted checkout payloads from full product prices only when the saved order total is lower.

### Stock Commitment Rule For Public Availability
- Common orders now affect public availability before `ENTREGUE` when the commitment is already real.
- The current commitment rule is:
  - online common order: reserve stock as soon as payment is approved
  - cash common order: reserve stock as soon as the store accepts the order
  - delivered order: perform definitive baixa
  - `ENCOMENDA`: keep the reservation tied to `PREPARACAO` and `PRONTO_ENTREGA`
- Payment-driven status changes must use the same stock synchronization path as manual kanban status changes.

### Availability Safety Net
- Public menu and public order creation now also subtract a shadow map of committed-but-not-yet-reserved orders.
- This is a defensive layer so older open orders or transitional states do not allow oversell even if their stock timestamps are still stale.
- If future refactors touch public availability, preserve both layers:
  - formal reservation in `ProdutoEstoque`
  - defensive shadow subtraction for unreconciled committed orders

### Admin Edit Behavior For Pending Online Orders
- When a pending online order is edited in admin and the payment composition changes, the previous local checkout state is intentionally invalidated.
- This protects the operation from reusing a stale payment link after:
  - item changes
  - price composition changes
  - manual discount changes
  - freight changes
  - payment-method changes
  - relevant payer/contact changes
- Operationally, the next payment-link action should generate a fresh link with the updated amount.

### Admin Detail Sheet Consistency Fix
- The payment actions in the kanban detail sheet must keep returning the full order payload, not a partial shape.
- This specifically avoids frontend regressions where `subtotal` and `total` can appear as `NaN` after payment-link refresh or payment-method actions.
- Cash orders now also receive a stronger badge/highlight in the kanban card and detail sheet so the team can immediately spot that the stock commitment came from operational acceptance instead of online approval.

### KDS Continuity Notes
- The KDS must remain a presentation and execution layer on top of the existing order lifecycle, not a second workflow.
- Current KDS scope:
  - lanes for `FEITO`, `ACEITO`, `PREPARACAO`, and `PRONTO_ENTREGA`
  - separate future `ENCOMENDA` agenda
  - pending-payment attention block
  - one-tap actions for payment confirmation, advance step, and return step
- Any future KDS refinement should keep using:
  - `/api/admin/pedidos/[id]/status`
  - `/api/admin/pedidos/[id]/pagamento`
  - the same stock synchronization path used by kanban
- No migration was created for this KDS phase.

### Validation Already Performed For This Fix
- `rtk npm --prefix order-system run lint`
- `rtk powershell -Command "cd 'C:\\SystemOrder\\order-system'; npx tsc --noEmit"`
- `rtk npm --prefix order-system run build`

### Migration Impact
- No new migration was created for this continuity fix.
- No local data reset is needed.

## Later Catalog And Customer CRUD Continuity Notes

### Product Lifecycle Split
- Product lifecycle is no longer represented by a single public flag.
- The current intended behavior is:
  - `ativo = true` and enough stock: normal sale
  - `ativo = true` with no stock but `disponivelParaEncomenda = true`: only `ENCOMENDA`
  - `ativo = false` and `descontinuado = false`: stays visible in the public menu as unavailable and blocked
  - `descontinuado = true`: hidden from the public menu and blocked from new selections, but preserved in history
- Public menu now has a dedicated `indisponiveis` section instead of simply hiding temporarily unavailable products.

### Admin Order Entry Rule
- The manual order page must keep showing all non-discontinued products.
- This includes products blocked in the public catalog.
- Existing orders being edited must not lose old items only because the linked product was later discontinued.

### Customer CRUD Safety
- Direct customer creation in admin no longer upserts by phone.
- If the phone already belongs to an existing customer, the API now returns conflict so the operator edits the current record instead of overwriting it by accident.

### Validation Already Performed For This Continuity
- `rtk powershell -Command "cd 'C:\\SystemOrder\\order-system'; npx prisma migrate deploy"`
- `rtk powershell -Command "cd 'C:\\SystemOrder\\order-system'; npx prisma generate --no-engine"`
- `rtk npm --prefix order-system run lint`
- `rtk powershell -Command "cd 'C:\\SystemOrder\\order-system'; npx tsc --noEmit"`
- `rtk npm --prefix order-system run build`

### Migration Impact
- New migration created: `20260716113000_add_produto_descontinuado_flag`
- Local migration: applied successfully without reset.

## Suggested Prompt For The Next Chat
Use something like:

`Leia AGENTS.md, PROJECT_CONTEXT.md e docs/admin-mobile-order-flow-handoff.md. Vamos continuar a evolução mobile-first do painel admin mantendo menos cliques, sem quebrar as regras de negócio e validando com lint/build/testes.`

## PR Preparation Notes

### Suggested PR Title
- `Admin mobile order flow: defaults, kanban detail redesign, responsive cleanup and validation setup`

### Suggested PR Summary
- Adds default delivery configuration for new manual orders.
- Improves mobile-first order creation and finishing flow.
- Redesigns the kanban detail drawer to reduce redundancy and improve action clarity.
- Refines mobile navigation and reports filters/actions.
- Adds and stabilizes lint validation for the current stack.
- Cleans legacy root scripts and generated local artifacts not tied to the active system flow.

### PRD Gate
- Before PRD migration:
  1. Confirm HML visual approval.
  2. Confirm code approval.
  3. Confirm there are no pending local-only adjustments.
  4. Ask the user explicitly if everything is OK.
  5. Only then run PRD migration flow.
