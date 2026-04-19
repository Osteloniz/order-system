# Brookie Pregiato - Sistema de Pedidos Online

Sistema de pedidos para o condominio Reserva Paulistano com cardápio, carrinho, checkout customizado e área administrativa. Projeto em Next.js com backend via API routes e banco Neon/Postgres usando Prisma.

## Funcionalidades
- ✅ Catálogo de produtos com categorias
- ✅ Carrinho de compras com itens
- ✅ Fluxo de checkout customizado (Reserva Paulistano)
- ✅ Tipos de entrega: Retirada e Entrega no Condomínio (Reserva Paulistano)
- ✅ Campos adicionais para Reserva Paulistano: WhatsApp, Bloco e Apartamento
- ✅ Botão de acompanhamento via WhatsApp na confirmação
- ✅ Área administrativa com dashboard de pedidos
- ✅ Gerenciamento de produtos, categorias, cupons e configurações
- ✅ Autenticação admin com NextAuth (credentials)
- ✅ Números de pedido amigáveis e sincronizados entre admin e cliente

## Stack
- Next.js 16 (App Router + Turbopack)
- React 19
- Tailwind CSS + shadcn/ui
- SWR para data fetching
- Prisma 5 + Neon/Postgres
- NextAuth.js v5 (credentials)
- TypeScript

## Como rodar
1) Instale as dependências:

```bash
npm install
# ou
pnpm install
```

2) Configure o `.env`:

```bash
NEXTAUTH_SECRET="sua-chave-forte-gerada-com-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
MERCADO_PAGO_ACCESS_TOKEN="APP_USR-ou-TEST..."
```

3) Sincronize o banco de dados:

```bash
npx prisma migrate deploy
npx prisma generate
```

4) (Opcional) Popule dados iniciais:

```bash
npx prisma db seed
```

5) Suba o ambiente de desenvolvimento:

```bash
npm run dev
# ou
pnpm dev
```

6) Acesse:
```
Cliente: http://localhost:3000
Admin: http://localhost:3000/admin
```

### Credenciais Admin
- **Usuário**: admin
- **Senha**: admin123 (ou a senha configurada em SEED_ADMIN_PASSWORD)

## Scripts
- `dev`: ambiente de desenvolvimento
- `build`: build de producao
- `start`: inicia o build
- `lint`: lint do projeto
- `prisma db seed`: popula dados iniciais no banco
- `vercel-build`: prisma generate + next build

## Estrutura (principais pastas)
- `app/`: rotas e paginas
- `components/`: componentes de UI e paginas
- `contexts/`: contextos de estado
- `lib/`: utilitarios e dados mockados
- `public/`: assets e imagens
- `docs/`: PRD, API e modelo de dados
- `prisma/`: schema Prisma
- `scripts/`: scripts auxiliares (deploy/migrations)

## Fluxo Admin
1. Acesse `/admin/login`
2. Digite as credenciais:
   - Usuário: `admin`
   - Senha: `admin123`
3. Acesso ao dashboard com abas:
   - **Todos**: todos os pedidos
   - **Novos**: pedidos com status "Pedido Recebido"
   - **Preparação**: pedidos em preparo
   - **Entregas**: pedidos entregues
4. Clique em um pedido para:
   - Ver detalhes completos (cliente, itens, endereço/bloco/apto)
   - Aceitar e mudar status
   - Cancelar pedido se necessário

## Fluxo Cliente
1. Acesse http://localhost:3000 (home)
2. Navegue pelo cardápio e adicione produtos ao carrinho
3. Clique em "Ver carrinho" e "Finalizar Pedido"
4. No checkout:
   - Preencha: Nome e Telefone
   - Selecione tipo de entrega:
     - **Retirada**: no endereço configurado
     - **Entrega Reserva Paulistano**: preencha Bloco, Apartamento e WhatsApp
   - Escolha forma de pagamento (PIX, Cartão ou Dinheiro)
   - Aplique cupom de desconto (opcional)
   - Confirme o pedido
5. Na confirmação:
   - Veja número do pedido (ex: `B67E5378`)
   - Clique "Acompanhar Pedido" para enviar mensagem via WhatsApp
   - Mensagem pré-formatada com número do pedido é enviada

## Tipos de Entrega

### Retirada
- Endereço configurado no admin
- Sem taxa adicional
- Cliente retira no local

### Entrega Reserva Paulistano
- Entrega dentro do condominio
- Campos obrigatórios:
  - **Bloco**: letra ou número do bloco
  - **Apartamento**: número do apartamento
  - **WhatsApp**: para acompanhamento da entrega
- Sem taxa adicional

## Números de Pedido
- Formato: últimos 8 caracteres do UUID em maiúsculas
- Exemplo: `B67E5378` (em vez de `EEDFAD68-7A2D-4393-A717-408AB67E5378`)
- Sincronizados entre:
  - Painel admin (detalhes do pedido)
  - Página de confirmação do cliente
  - Mensagem WhatsApp de acompanhamento

## Campos de Cliente por Tipo de Entrega

### Campos comuns (todos os tipos)
- `clienteNome`: Nome completo
- `clienteTelefone`: Telefone para contato

### Campos específicos - Reserva Paulistano
- `clienteWhatsapp`: WhatsApp para acompanhamento
- `clienteBloco`: Bloco do condominio (obrigatório)
- `clienteApartamento`: Número do apartamento (obrigatório)

## Banco de Dados
- Neon/Postgres via `DATABASE_URL`
- `DIRECT_URL` recomendado para migrations em producao
- Schema Prisma em `prisma/schema.prisma`
- Migrations em `prisma/migrations/`

Tabelas principais:
- `Pedido`: pedidos dos clientes
- `ItemPedido`: itens de cada pedido
- `Produto`: produtos do cardápio
- `Categoria`: categorias de produtos
- `AdminUser`: usuários admin
- `Cupom`: códigos de desconto
- `Configuracao`: configurações do estabelecimento
- `Tenant`: informações do estabelecimento (single-tenant: "brookie-pregiato")

## Observações
- Sistema convertido de multi-tenant para single-tenant (Brookie Pregiato)
- Checkout customizado para Reserva Paulistano com Bloco/Apartamento
- Integração WhatsApp para acompanhamento de pedidos
- Números de pedido amigáveis e sincronizados
- Para mais informações, veja a documentação em `docs/`
