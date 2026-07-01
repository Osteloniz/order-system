# Prompt Inicial

## Como iniciar um novo chat neste projeto
Use este comando base:

`Leia C:\SystemOrder\AGENTS.md, C:\SystemOrder\order-system\PROMPTINICIAL.md, C:\SystemOrder\order-system\PROJECT_CONTEXT.md, C:\SystemOrder\order-system\docs\admin-mobile-order-flow-handoff.md, C:\SystemOrder\order-system\SECURITY_AUTH.md e C:\SystemOrder\order-system\docs\API.md antes de qualquer acao. Quero continuar daqui: <descreva a proxima tarefa>.`

## Contexto consolidado
- Projeto principal em `C:\SystemOrder\order-system`
- Fluxo mobile-first do admin ja foi remodelado
- PR dessa frente ja foi mergeada
- Migrations de PRD dessa entrega ja foram aplicadas com sucesso
- Banco de producao esta atualizado ate este ponto
- A continuidade do trabalho deve preservar regras de negocio e evitar regressoes
- A direcao atual de PWA e incremental: primeiro experiencia instalavel e online confiavel, sem assumir operacao offline completa no admin
- A paleta visual base foi redefinida em torno de caramelo queimado `#DDA15E`, avela `#7F5539`, cacau intenso `#1A110C`, card `#2C241E` e texto aveia `#EDE0D4`

## Forma de trabalho esperada
- Primeiro entender o contexto local e o codigo antes de mudar qualquer coisa
- Priorizar UX mobile sem prejudicar desktop
- Nao inventar regra nova de negocio sem alinhamento explicito
- Validar sempre com testes e comandos relevantes
- Se houver impacto em banco, seguir o fluxo `local -> HML -> validacao -> PRD`
- Comunicar de forma objetiva, colaborativa e cuidadosa
- Entregar ponta a ponta sempre que possivel: analise, implementacao, validacao e documentacao

## Arquivos que devem ser lidos no inicio
- `C:\SystemOrder\AGENTS.md`
- `C:\SystemOrder\order-system\PROJECT_CONTEXT.md`
- `C:\SystemOrder\order-system\docs\admin-mobile-order-flow-handoff.md`
- `C:\SystemOrder\order-system\SECURITY_AUTH.md`
- `C:\SystemOrder\order-system\docs\API.md`

## Estado atual importante
- O sistema usa `Next.js App Router`, `React 19`, `Prisma` e `Postgres/Neon`
- O desenvolvimento local esperado usa `Node.js 22.22.3`
- Existe fluxo formal para migracoes de producao via scripts do projeto
- O foco atual e seguir evoluindo interfaces e fluxos com atencao especial ao uso mobile no admin
- As telas de estoque e producao ja receberam uma nova passada mobile-first, alinhando hero, filtros, cards-resumo e blocos de cadastro rapido ao padrao visual novo
- As telas de clientes, produtos e categorias tambem ja foram aproximadas do mesmo padrao mobile-first, com hierarquia visual mais clara, dialogs melhores no celular e cards operacionais mais consistentes
- A lista de clientes foi refinada para uma leitura mais compacta no mobile, com avatar por iniciais, badges de contexto e menos aspecto de card pesado na rolagem
- As telas de cupons, contas a pagar, contas a receber e fluxo de caixa ja receberam uma nova passada visual/mobile-first, preservando comportamento e priorizando legibilidade no celular
- Ja existe base tecnica de PWA com `manifest` e registro de `service worker`, mas o `sw.js` atual ainda e propositalmente minimo e nao implementa operacao offline segura
- O sistema ja suporta tema `claro`, `escuro` e `sistema`; a base global foi ajustada para a nova identidade visual, e os proximos refinamentos devem continuar substituindo cores hardcoded restantes por tokens semanticos
- Nesta passada nao houve alteracao em `prisma/schema.prisma` nem em `prisma/migrations/`; portanto nao existe atualizacao de banco pendente por causa dessas telas
- O proximo passo natural e revisao visual final em HML/local, seguida de preparacao de PR e depois fluxo de PRD apenas apos confirmacao explicita do usuario

## Regra para continuidade entre chats
- Ao final de cada conversa relevante, este documento deve ser revisado e atualizado se houver mudanca de contexto, processo, entregas, migracoes, decisoes de UX, fluxo de deploy ou pontos de atencao
- A ideia e que o proximo chat consiga continuar do mesmo nivel de contexto e qualidade com o menor atrito possivel

## Pedido padrao para o proximo chat
Use algo como:

`Leia o PROMPTINICIAL e os arquivos de contexto referenciados nele antes de agir. Quero continuar daqui: <descreva a proxima tarefa>. Mantenha o mesmo padrao de entrega do chat anterior: analise cuidadosa, implementacao completa, validacao, documentacao e atencao total para nao quebrar nada. Ao final, atualize o PROMPTINICIAL se for necessario para manter a continuidade dos proximos chats.`
