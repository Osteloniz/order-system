# Checklist HML - Checkout Publico Seguro

## 1. Aplicar banco e Prisma Client

```bash
rtk powershell -Command "Get-Process node | Stop-Process -Force"
rtk npx prisma migrate deploy --schema prisma/schema.prisma
rtk npx prisma generate --schema prisma/schema.prisma
rtk npm --prefix order-system run dev
```

## 2. Validar criacao de pedido novo no checkout publico

- Abrir `/menu`
- Adicionar itens
- Finalizar pedido
- Confirmar que redireciona para `/confirmacao/{id}` sem expor token na URL
- Confirmar que a tela abre normalmente

## 3. Validar protecao do link publico

- Abrir a confirmacao no mesmo navegador usado no checkout: deve abrir normalmente via cookie seguro
- Copiar apenas a URL limpa `/confirmacao/{id}` para aba anonima: nao deve abrir
- Acessar um link legado com `?token=...`: deve abrir, gravar o cookie e limpar a URL em seguida
- Trocar o token legado por valor invalido: nao deve abrir
- Tentar acessar so com o `id`: nao deve abrir para pedido novo

## 4. Validar compatibilidade de pedido antigo

- Abrir um pedido criado nessa versao por link legado com `?token=...`
- Confirmar que a tela de confirmacao abre
- Confirmar que a URL volta para `/confirmacao/{id}` sem token exposto
- Recarregar a pagina e confirmar que continua funcionando pelo cookie
- Confirmar que pedidos realmente legados sem `publicAccessTokenHash` nao ganham acesso publico automatico

## 5. Validar cancelamento publico

- Criar pedido novo com status `FEITO`
- Cancelar pela confirmacao: deve funcionar
- Repetir sem token ou com token invalido: nao deve funcionar
- Testar pedido ja aceito ou pago: deve bloquear como antes

## 6. Validar prefill por telefone conhecido

- Informar telefone de cliente ja cadastrado
- Confirmar que o nome vem preenchido
- Confirmar que o nome fica bloqueado/esmaecido
- Confirmar que bloco/apartamento vem quando existir
- Confirmar que o telefone nao volta exposto por API alem do necessario

## 7. Validar telefone novo

- Informar telefone nao cadastrado
- Confirmar mensagem de "nao encontrado"
- Confirmar que nome fica editavel
- Finalizar pedido
- Confirmar que o pedido entra normalmente no kanban
- Confirmar que um cliente novo foi criado

## 8. Validar que checkout nao sobrescreve cliente existente

- Usar telefone de cliente ja cadastrado
- Tentar mudar nome no checkout: deve ficar travado quando cadastro existir
- Finalizar pedido
- Conferir no admin que o cadastro mestre do cliente nao foi alterado indevidamente
- Conferir que o pedido entrou com o snapshot esperado

## 9. Validar historico recente no aparelho

- Apos criar pedido novo, voltar ao menu
- Confirmar que "ultimos pedidos" aparece
- Abrir item do historico: deve funcionar usando a URL limpa
- Limpar historico: deve sumir da lista

## 10. Validar regressao operacional

- Pedido criado via checkout aparece no kanban
- Status continuam mudando normalmente no admin
- Confirmacao continua refletindo mudanca de status
- Fluxo de encomenda, retirada e Reserva Paulistano continua funcionando

## 11. Validar logs e erros

- Sem erro 500 no console do app nas rotas:
- `/api/pedidos`
- `/api/pedidos/[id]`
- `/api/clientes/prefill`
- Sem erro Prisma de coluna ausente apos migration

## 12. Validar build final

```bash
rtk npm --prefix order-system run test:auth-security
rtk npm --prefix order-system run build
```

## Criterio de aceite

- Pedido novo so abre confirmacao no navegador que recebeu o cookie seguro
- Link limpo nao concede acesso em outro navegador sem o cookie
- Link legado com token ainda funciona apenas como compatibilidade de transicao
- Cancelamento publico respeita token
- Prefill continua util, mas sem exposicao excessiva
- Cliente existente nao e sobrescrito automaticamente
- Kanban e operacao seguem intactos
