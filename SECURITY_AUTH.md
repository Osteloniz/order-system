# Security Auth

## Visao geral

O painel administrativo continua usando `NextAuth` com `CredentialsProvider`, mas agora com endurecimento incremental e sem cadastro publico aberto.

O fluxo atual fica assim:

1. O admin acessa `/admin/login`
2. Opcionalmente passa pela chave `ADMIN_ACCESS_KEY`, se ela estiver configurada
3. Faz login com `usuario ou e-mail` + senha
4. A sessao e mantida por cookie `HttpOnly`
5. Novos usuarios admin sao criados somente por convite

## O que existe hoje

- Senha de admin armazenada somente em `passwordHash`
- Hash de senha com `bcrypt`
- Sessao via `NextAuth`
- Cookie com `HttpOnly`, `SameSite=Lax` e `Secure` em producao
- Auditoria minima para login, logout, convite criado, convite usado e usuario criado
- Convites com token aleatorio seguro, hash no banco, expiracao e uso unico

## Como funciona o login

- O campo de login aceita `username` ou `email`
- Usuarios antigos continuam funcionando com o `username` atual
- Usuarios criados por convite recebem `email` e um `username` derivado automaticamente
- Em falha de credencial, a resposta exibida ao usuario deve ser generica

Mensagem esperada:

- `Usuario ou senha invalidos.`

## Como funciona o convite

Nao existe cadastro publico.

O fluxo de convite:

1. Um admin autenticado chama `POST /api/admin/invites`
2. Informa o e-mail autorizado
3. O sistema gera um token criptograficamente seguro
4. Apenas o `hash` do token e salvo no banco
5. O link do convite e retornado uma unica vez
6. O usuario acessa `/auth/invite?token=...`
7. O sistema valida se o convite:
   - existe
   - nao expirou
   - nao foi usado
   - nao foi revogado
   - ainda nao virou usuario
8. O usuario define nome e senha
9. O sistema cria o admin e marca o convite como `USED`

## Estrutura nova de banco

### AdminUser

Campos adicionados de forma compativel:

- `email`
- `emailNormalizado`

Esses campos sao opcionais para nao quebrar usuarios existentes.

### UserInvite

Tabela criada para convites:

- `id`
- `tenantId`
- `email`
- `emailNormalizado`
- `tokenHash`
- `expiresAt`
- `usedAt`
- `revokedAt`
- `createdAt`
- `createdBy`
- `status`

### AuthAuditLog

Tabela minima de auditoria:

- `LOGIN_SUCCESS`
- `LOGIN_FAILURE`
- `LOGOUT`
- `INVITE_CREATED`
- `INVITE_USED`
- `USER_CREATED`

## Variaveis de ambiente necessarias

Minimas:

```env
DATABASE_URL=""
DIRECT_URL=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
ADMIN_ACCESS_KEY=""
TOKEN_PEPPER=""
BCRYPT_ROUNDS="12"
INVITE_EXPIRY_HOURS="24"
```

Observacoes:

- `TOKEN_PEPPER` deve ser forte e secreto em producao
- `APP_URL` e usado para montar o link de convite
- `ADMIN_ACCESS_KEY` e opcional, mas recomendado para endurecer o acesso ao painel

## Como gerar um convite

Exemplo:

```bash
curl -X POST http://localhost:3000/api/admin/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=SEU_COOKIE" \
  -d "{\"email\":\"novo.admin@empresa.com\"}"
```

Resposta esperada:

```json
{
  "id": "invite-id",
  "email": "novo.admin@empresa.com",
  "status": "PENDING",
  "expiresAt": "2026-05-21T12:00:00.000Z",
  "inviteLink": "http://localhost:3000/auth/invite?token=...",
  "token": "...",
  "manualDelivery": false
}
```

Importante:

- o token puro nao fica salvo no banco
- se o link nao for guardado nesse momento, ele nao pode ser recuperado depois

## Como registrar um usuario por convite

1. Abrir o link de convite
2. Informar nome e senha
3. Acessar `/admin/login`
4. Entrar com o e-mail convidado ou com o `username` derivado

## Usuarios existentes

Usuarios existentes continuam funcionando porque:

- o campo `passwordHash` foi preservado
- o hash atual ja e `bcrypt`
- o login por `username` continua aceito

Se quiser permitir login por e-mail para um admin legado, basta preencher:

- `email`
- `emailNormalizado`

Exemplo pratico para o admin atual:

- e-mail desejado: `joao.murat30@gmail.com`

Essa vinculacao pode ser feita depois com seguranca, sem resetar senha.

## Logout

O logout continua baseado em `NextAuth`, com auditoria via `POST /api/auth/logout` antes do `signOut`.

## Rate limit

Hoje existe limitacao de tentativas por:

- IP
- combinacao `IP + identificador`

Observacao importante:

- a implementacao atual ainda e em memoria
- em producao distribuida, o ideal futuro e mover isso para armazenamento compartilhado

## Como testar em desenvolvimento

1. Rode a migration:

```bash
npx prisma migrate deploy
npx prisma generate
```

2. Suba o app:

```bash
npm run dev
```

3. Faça login no admin existente
4. Gere um convite por `POST /api/admin/invites`
5. Abra o `inviteLink`
6. Crie o usuario
7. Faça login com o e-mail convidado

## Testes automatizados incluidos

Rodar:

```bash
npm run test:auth-security
```

Esses testes cobrem as primitivas de seguranca mais sensiveis:

- normalizacao de e-mail
- geracao de token seguro
- hash de token opaco
- mascaramento de e-mail
- derivacao de username
- resolucao de status do convite

## Cuidados para producao

- usar branch de homologacao no Neon antes de PRD
- aplicar migration em staging primeiro
- revisar `NEXTAUTH_SECRET` e `TOKEN_PEPPER`
- nao expor o link/token de convite em logs
- preferir entrega do convite por e-mail no futuro
- manter `.env` fora do Git

## Deploy seguro

Fluxo recomendado:

1. testar em homologacao
2. aplicar migration em homologacao
3. validar login e convite
4. subir codigo
5. rodar `npx prisma migrate deploy` no banco de producao
6. validar login admin e criacao de convite
