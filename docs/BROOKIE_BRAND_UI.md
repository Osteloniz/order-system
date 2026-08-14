# Brookie Brand UI

## Official palette

- Peach: `#E7B99B`
- Dark brown: `#421C14`
- Cream: `#E7DBB3`
- Operational green: `#40631A`
- Cookie orange: `#C56813`
- Supporting blue: `#559EEE`

Brown and cream carry the brand identity. Green is the primary operational action, orange highlights attention or production context, and blue remains a supporting information color.

## Imported assets

- `/brand/brookie-logo-light.jpg`: full-color logo on the official cream background.
- `/brand/brookie-logo-dark.jpg`: monochrome light logo on the official dark-brown background.
- `/brand/brookie-mark-color.jpg`: compact color character/cookie mark used by the admin navigation.
- `/brand/brookie-cookie-bite-dark.jpg`: dark bitten-cookie artwork used on the light login theme.
- `/brand/brookie-cookie-bite-light.jpg`: light bitten-cookie artwork used on the dark login theme.

The original designer files remain outside the repository. The project copies above are the runtime assets actually referenced by the application.

## UI usage

- Use the complete logo in branded entry or overview surfaces, not repeatedly inside operational forms.
- Use the compact mark in navigation headers and small identity anchors.
- Preserve a high-density, mobile-first layout for the admin even when using playful brand elements.
- Keep body and control typography optimized for reading. The display lettering shown in the artwork is treated as a brand-expression reference until licensed webfont files are supplied.
- Do not use decorative cookie patterns behind dense tables, forms, KDS lanes or order lists.
- The public menu uses the compact official mark in the fixed header and hero while keeping product discovery denser than the institutional surfaces.

## Admin navigation contract

- Immediate: `Início`, `Pedidos`, `Nova venda`, `KDS`.
- Cadastros: clients, products, product categories, coupons, stock and production.
- Financeiro: reports, receivables, cash flow, payables and financial categories.
- Gestão: settings and logs.
- `/admin` remains the orders route; `/admin/inicio` is the branded overview.
