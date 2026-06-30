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
