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
- A paleta visual base foi redefinida para um caminho mais limpo e operacional, com fundo claro em `#F8FAFC`, superficies brancas, destaque azul lavanda em torno de `#5B6CFA`, `#4556E8`, apoio suave `#EEF1FF` e texto forte `#111827`; quando faltar cor auxiliar, os contrastes devem derivar dessa familia sem saturar o layout

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
- `C:\SystemOrder\order-system\docs\hml-mercado-pago-checkout-pro.md`
- `C:\SystemOrder\order-system\SECURITY_AUTH.md`
- `C:\SystemOrder\order-system\docs\API.md`

## Estado atual importante
- O sistema usa `Next.js App Router`, `React 19`, `Prisma` e `Postgres/Neon`
- O desenvolvimento local esperado usa `Node.js 22.22.3`
- Existe fluxo formal para migracoes de producao via scripts do projeto
- O foco atual e seguir evoluindo interfaces e fluxos com atencao especial ao uso mobile no admin
- As telas de estoque e producao ja receberam uma nova passada mobile-first, alinhando hero, filtros, cards-resumo e blocos de cadastro rapido ao padrao visual novo
- As telas de clientes, produtos e categorias tambem ja foram aproximadas do mesmo padrao mobile-first, com hierarquia visual mais clara, dialogs melhores no celular e cards operacionais mais consistentes
- O cadastro de produtos agora precisa preservar tambem a flag manual `novidade`, usada para destacar itens em uma secao dedicada de novidades no menu publico sem tirar o produto da categoria original
- O cadastro de produtos agora tambem precisa preservar a flag `disponivelParaEncomenda`, porque a disponibilidade publica passa a depender do saldo em estoque: com saldo vende normal, sem saldo mas com essa flag vira `somente encomenda`, sem saldo e sem essa flag fica bloqueado
- O lancamento de producao no estoque agora deve seguir fluxo em lote por modal: informar total produzido do dia, distribuir obrigatoriamente entre os sabores e exigir que a soma dos sabores bata exatamente com o total antes de salvar
- Esse fluxo de lancamento em lote agora ficou consolidado na tela canonica `admin/estoque`, mantendo um unico botao para abrir o modal, lista por sabor com checkbox para habilitar quantidade e redirecionamento de compatibilidade a partir de `admin/producao`
- A lista de clientes foi refinada para uma leitura mais compacta no mobile, com avatar por iniciais, badges de contexto e menos aspecto de card pesado na rolagem
- As telas de cupons, contas a pagar, contas a receber e fluxo de caixa ja receberam uma nova passada visual/mobile-first, preservando comportamento e priorizando legibilidade no celular
- Ja existe base tecnica de PWA com `manifest` e registro de `service worker`, mas o `sw.js` atual ainda e propositalmente minimo e nao implementa operacao offline segura
- O sistema ja suporta tema `claro`, `escuro` e `sistema`; a base global foi ajustada para a nova identidade visual, e os proximos refinamentos devem continuar substituindo cores hardcoded restantes por tokens semanticos
- O fluxo publico agora abre direto no catalogo pela raiz `/`, sem expor login admin, e o link de catalogo mostrado em configuracoes deve ser tratado como o link principal a enviar para clientes
- No fluxo publico do cliente, a troca manual de tema nao deve mais aparecer; o catalogo, checkout e confirmacao agora devem acompanhar o tema do sistema/aparelho por padrao, sem seletor manual exposto ao cliente
- O checkout publico foi aproximado do novo padrao visual e agora consulta cadastro existente por telefone para pre-preencher nome e endereco quando houver cliente ja salvo
- O bloco `Identificacao e contato` do checkout publico foi refinado para deixar o telefone mais guiado e claramente obrigatorio, com feedback visual de busca do cadastro e nome travado quando o numero ja pertence a um cliente encontrado
- O acompanhamento publico de pedido agora deve ser tratado como fluxo protegido por token de acesso por pedido, e nao mais apenas pelo `id` exposto na URL
- Esse acesso publico do pedido foi endurecido: o fluxo padrao agora deve usar cookie `HttpOnly` por pedido para abrir confirmacao, retomar pagamento e cancelar com seguranca; tokens em query string e header ficaram apenas como compatibilidade controlada para transicao, e nao devem voltar a ser a base do fluxo normal
- A edicao de clientes no admin agora permite corrigir o telefone principal, com bloqueio de conflito quando o numero ja pertence a outro cadastro
- No checkout publico, o pagamento segue sendo apenas um indicador de metodo para controle operacional; a efetivacao continua sendo tratada fora do site
- Essa regra mudou: agora estamos iniciando a integracao de pagamento online com Asaas Checkout hospedado, preservando o fluxo do pedido local e confirmando o financeiro por webhook
- O checkout publico agora tambem e configuravel por tenant: o admin pode ligar/desligar tipos de entrega, controlar pagamentos disponiveis e definir se `ENCOMENDA` usa data escolhida pelo cliente ou data fixa da loja
- O checkout publico agora tambem pode seguir um horario automatico diario configurado no admin; esse horario complementa o toggle manual `aberto para pedidos`, nao o substitui: se a loja estiver fechada manualmente continua fechada, e se o horario automatico estiver ativo o menu/checkout devem bloquear pedidos fora da janela configurada no horario de Sao Paulo
- Para pagamento com cartao no checkout publico, a interface agora permite expor `credito`, `debito` ou ambos, espelhando melhor o fluxo do pedido manual
- Nesta passada houve alteracao em `prisma/schema.prisma` e foi criada a migration `20260713113000_add_public_checkout_controls_to_configuracao`
- Nesta frente do horario automatico do checkout publico tambem foi criada a migration `20260719193000_add_public_checkout_hours_to_configuracao`
- Nesta frente de seguranca do checkout publico tambem foi criada a migration `20260713170000_add_public_order_access_token`
- Nesta frente de menu/produtos tambem foi criada a migration `20260715110000_add_produto_novidade_flag`
- Nesta frente de estoque/menu tambem foi criada a migration `20260715143000_add_produto_disponivel_para_encomenda`
- Nesta frente de pagamento online tambem foi criada a migration `20260715193000_add_asaas_checkout_integration`
- O legado antigo de Mercado Pago nao deve ser reutilizado, mas agora existe uma nova integracao de Mercado Pago sobre a camada atual de checkout hospedado e ela passou a ser o gateway padrao da operacao quando `ONLINE_PAYMENT_GATEWAY="MERCADO_PAGO"`
- Na forma atual dessa integracao, cartao segue no Checkout Pro, mas o Pix do Mercado Pago passou a usar cobranca direta por API como fluxo principal, com QR Code e copia-e-cola exibidos na confirmacao publica; a trilha antiga de Checkout Pro para Pix ficou apenas como compatibilidade tecnica e nao deve mais ser exposta como fluxo principal
- O payload tecnico do Pix direto do Mercado Pago foi endurecido para evitar falhas de criacao por identificadores invalidos; qualquer ajuste futuro nessa trilha deve preservar e-mail tecnico curto/seguro e continuar tratando webhook apenas como confirmacao posterior, nao como etapa de geracao da cobranca
- O fluxo do Mercado Pago agora tambem deve sincronizar o status do pagamento no retorno publico do checkout sempre que houver `payment_id`, para nao depender exclusivamente do webhook assíncrono
- A protecao de disponibilidade publica agora tambem precisa considerar uma sombra temporaria para pedidos publicos muito recentes em `FEITO`, alem da revalidacao transacional com lock das linhas de estoque no fechamento do pedido, para reduzir a brecha da ultima unidade em acessos simultaneos
- O retorno do gateway nao deve expor diretamente o token publico do pedido para terceiros; a integracao agora usa um token separado de retorno do Asaas e depois reemite o token publico normal na confirmacao
- Pedidos antigos sem `publicAccessTokenHash` nao devem mais receber bootstrap automatico de token no primeiro acesso anonimo; essa brecha foi fechada e qualquer compatibilidade futura precisa ser pensada de forma explicita e segura
- Para validar Asaas localmente em sandbox, `APP_URL` nao pode ficar em `localhost`; o checkout rejeita callbacks locais, entao testes fim a fim precisam de uma URL publica temporaria e do webhook sincronizado para ela
- Existe agora um fluxo auxiliar para isso com `scripts/asaas-sandbox-webhook.mjs`, `scripts/asaas-checkout-smoke.mjs` e `scripts/asaas-pix-key.mjs`, e a chave do Asaas no `.env` local precisa ficar escapada como `\$...` quando comecar com `$`
- O checkout publico deve esconder e bloquear Pix quando a conta Asaas autenticada nao tiver chave Pix ativa; cartao online continua liberado se o restante da configuracao estiver habilitado
- Agora existe tambem uma camada configuravel de gateway online: `ONLINE_PAYMENT_GATEWAY` pode usar `ASAAS` ou `MERCADO_PAGO`, sem migration nova nesta fase, e neste momento o padrao operacional esta apontado para Mercado Pago
- A integracao nova do Mercado Pago nao deve reaproveitar o legado antigo; ela foi reconstruida na camada atual de checkout hospedado, apenas reutilizando temporariamente os campos persistidos ja existentes para evitar mudanca de schema agora
- A tela publica de confirmacao agora deve permitir retomar o checkout online pelo mesmo link quando ele ainda estiver valido e pedir renovacao do link quando necessario, sem criar checkout duplicado sem necessidade
- O kanban agora tambem precisa tratar cobranca de forma mais operacional: copiar link, validar/renovar link e reenviar cobranca por WhatsApp usando o checkout atual ou um novo apenas quando o anterior nao puder mais ser reaproveitado
- O painel agora tambem identifica visualmente qual gateway gerou a cobranca online atual (`Asaas` ou `Mercado Pago`), tanto no card quanto no detalhe do pedido, e ganhou um resumo admin-only de checkout online para leitura rapida da operacao
- Agora tambem existe uma tela dedicada `admin/kds` para execucao operacional mobile/tablet-first, com filas rapidas por etapa, agenda separada de encomendas futuras e acoes de um toque para confirmar pagamento, avancar e retornar status usando exatamente as mesmas regras do kanban
- A troca de forma de pagamento em pedidos online agora segue uma trava de seguranca: se ainda existir um checkout online ativo, a troca deve ser bloqueada para evitar duplicidade de cobranca
- O checkout hospedado do Asaas agora precisa sempre refletir o valor final salvo do pedido, incluindo frete, cupom e valor promocional manual; nao devemos voltar a gerar checkout online com preco cheio dos itens quando houver desconto no pedido
- Quando um pedido online pendente for editado no admin e isso mudar composicao financeira ou dados relevantes da cobranca, o estado local do checkout antigo deve ser invalidado para forcar a proxima geracao de link com o valor novo, evitando reaproveitar um link stale
- Excecao importante da fase HML Mercado Pago: para evitar divergencia de cobranca com uma preferencia antiga ainda valida, pedidos com link pendente ativo do Mercado Pago agora bloqueiam edicao de valor, itens e dados relevantes de cobranca em vez de simplesmente invalidar o estado local
- O kanban de pedidos agora tambem tem o status intermediario `PRONTO_ENTREGA`, ligado ao pagamento: pedidos com estoque podem ir direto para esse estado assim que o pagamento for aprovado, enquanto `PREPARACAO` passou a representar principalmente a etapa real de producao de `ENCOMENDA`; se o pagamento deixar de estar aprovado antes da entrega, pedido comum volta para `ACEITO` e `ENCOMENDA` volta para `PREPARACAO`
- A regra de reserva de estoque para pedidos comuns ficou mais rigida: pedido online reserva assim que o pagamento e aprovado, pedido em dinheiro reserva assim que a loja o aceita, e a baixa definitiva continua acontecendo apenas em `ENTREGUE`
- Mudancas de pagamento que alteram o compromisso do pedido agora tambem precisam sincronizar estoque: webhook do Asaas, confirmacao manual de pagamento no kanban e troca de forma de pagamento nao podem mais mexer so no status sem reservar ou liberar saldo
- O webhook do Asaas foi endurecido para priorizar o `payment.status` real da cobranca ao decidir `statusPagamento` e mover o pedido automaticamente, em vez de confiar apenas no nome do evento recebido
- O menu publico e a validacao do checkout agora tambem usam uma camada de seguranca para descontar pedidos comprometidos que ainda nao viraram reserva formal no estoque, evitando oversell em pedidos antigos ou estados intermediarios
- No kanban, pedidos em `DINHEIRO` agora precisam ficar visualmente destacados para o time identificar rapido que o compromisso de estoque veio do aceite operacional e nao de pagamento online
- Antes de validar em HML/PRD ou subir deploy com essa entrega, sera obrigatorio aplicar a migration no banco e regenerar o Prisma Client
- Nesta frente do kanban/pagamento tambem foi criada a migration `20260715213000_add_pedido_pronto_entrega_status`
- O prefill publico por telefone agora deve continuar minimalista e com limitacao de tentativas; a unica excecao atual e a recuperacao de ultimos pedidos por numero, que deve continuar limitada, rate-limited e sem abrir dados extras do cadastro alem do necessario para acompanhar o pedido
- O checkout publico nao deve mais sobrescrever automaticamente o cadastro mestre do cliente quando encontra um telefone existente; o pedido pode usar snapshot proprio sem regravar o registro base
- A faixa `Seus ultimos pedidos` do menu publico agora prioriza busca por telefone no servidor em vez de depender do aparelho; ela precisa continuar compativel com uma evolucao futura de autenticacao mais forte, como codigo de confirmacao via WhatsApp
- O cadastro de produtos agora tambem precisa separar `indisponivel no catalogo` de `descontinuado`: produto indisponivel continua aparecendo no menu publico em secao propria e bloqueado para selecao, enquanto `descontinuado` some do menu e de novas selecoes sem apagar historico
- O pedido manual no admin agora deve continuar listando todos os produtos operacionais, inclusive os marcados como indisponiveis no catalogo publico; a unica trava real para novas selecoes passou a ser `descontinuado`
- O CRUD direto de clientes no admin agora nao deve mais sobrescrever silenciosamente um cadastro existente quando um novo cliente e criado com o mesmo telefone; nesse caso o backend deve retornar conflito explicito e orientar a editar o cadastro existente
- Nesta frente de catalogo/produtos tambem foi criada a migration `20260716113000_add_produto_descontinuado_flag`
- Existe agora um checklist operacional dedicado em `docs/prd-go-live-asaas-dominio-checklist.md` para a subida segura desta frente em PRD com dominio customizado, Vercel, migrations e configuracao do Asaas
- Existe agora tambem `docs/hml-mercado-pago-checkout-pro.md` para a validacao gradual do Mercado Pago em HML/local, incluindo variaveis de ambiente, webhook, comportamento do Pix por QR Code/copia-e-cola e a observacao de que nao ha migration nova nesta etapa
- O fluxo do kanban apos a criacao do pedido deve continuar sendo preservado; esta frente mexe no checkout e nas configuracoes, nao no pipeline central de status
- O CRUD de cupons agora deve tratar `expiraEm` como opcional na operacao do admin, usando apenas data sem hora; em branco significa cupom sem expiracao, sem exigir migration nova nesta fase
- O seletor de tenant publico, o menu, o carrinho, o checkout e a API de criacao de pedido agora precisam continuar usando o mesmo conceito de `loja aberta efetiva`; nao vale reintroduzir verificacoes isoladas apenas em cima de `tenant.isOpen`
- O proximo passo natural, se quisermos continuar essa frente, e revisar detalhes finais do checkout publico e depois entrar nos ajustes pontuais do kanban sem alterar sua logica principal
- Na camada de tenant, ausencia de cookie ainda pode usar o tenant padrao no cenario atual de marca unica, mas cookie invalido nao deve mais cair silenciosamente no tenant default

## Regra para continuidade entre chats
- Ao final de cada conversa relevante, este documento deve ser revisado e atualizado se houver mudanca de contexto, processo, entregas, migracoes, decisoes de UX, fluxo de deploy ou pontos de atencao
- A ideia e que o proximo chat consiga continuar do mesmo nivel de contexto e qualidade com o menor atrito possivel

## Pedido padrao para o proximo chat
Use algo como:

`Leia o PROMPTINICIAL e os arquivos de contexto referenciados nele antes de agir. Quero continuar daqui: <descreva a proxima tarefa>. Mantenha o mesmo padrao de entrega do chat anterior: analise cuidadosa, implementacao completa, validacao, documentacao e atencao total para nao quebrar nada. Ao final, atualize o PROMPTINICIAL se for necessario para manter a continuidade dos proximos chats.`
