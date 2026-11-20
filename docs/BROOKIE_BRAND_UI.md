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


## Identidade interna por tenant

A seleção em Configurações → Aparência controla as identidades Padrão, Natal e Ano Novo. O seletor claro, escuro e sistema continua disponível de forma independente. O atributo `data-brookie-internal` no elemento `html` aplica os tokens a navegação, componentes e portais. A área pública e o login pré-sessão usam a identidade padrão.

- A arte transparente dos temas sazonais entra na composição do Início, sobre superfície clara delimitada para preservar a leitura da marca nos dois modos.
- A variante unitária aparece na prévia de Configuração. As quatro artes WebP ficam em `public/brand/themes/{natal,ano-novo}`.
- O Caixa e o KDS abrem na área de trabalho, com superfícies sólidas e rótulos semânticos. No Caixa, catálogo e sacola dividem a área em telas largas. Em celular, a barra de total e confirmação permanece acessível.
- Verifique foco, status, diálogo e contraste nos dois modos dentro dos três temas. Use 4,5:1 para texto normal e 3:1 para foco e componentes aplicáveis.

No Caixa Express, o cabeçalho usa a marca compacta. **Mais vendidos** tem uma superfície própria, e os cartões de produto deixam preço, estoque e adição na mesma área. Sacola, cliente, observação e pagamento usam os tokens do tenant. O total e a conclusão ficam na barra inferior em telas estreitas.
