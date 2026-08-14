# Seguranca do acesso administrativo

## Regra operacional

O painel e restrito a pessoas reais com conta individual. Joao e o usuario `MASTER`; somente o master pode convidar outros administradores. Nao existe cadastro publico, conta compartilhada nem acesso para assistentes de IA.

Cada administrador usa e-mail, senha, autenticador e codigos de recuperacao proprios.

## Fluxo de acesso

1. Em producao, `/admin` exige a chave previa `ADMIN_ACCESS_KEY`.
2. A chave correta gera um cookie assinado, aleatorio, `HttpOnly`, `Secure` e valido por no maximo 12 horas; o valor literal da chave nunca e salvo no cookie.
3. A primeira tela valida somente e-mail e senha e emite um desafio AES-256-GCM HttpOnly, SameSite Strict, vinculado ao IP/user-agent e valido por cinco minutos.
4. A segunda tela valida TOTP ou codigo de recuperacao; somente entao a sessao administrativa e criada.
5. O convite cria um usuario inativo. A ativacao ocorre apenas quando o convidado define a senha e confirma seu proprio autenticador pelo link de uso unico.
6. A sessao administrativa dura no maximo 4 horas e e invalidada quando `sessionVersion` muda.

## MFA / Google Authenticator

A integracao usa TOTP (RFC 6238), compativel com Google Authenticator, Microsoft Authenticator, 1Password e equivalentes. Nao existe chamada para uma conta Google e o segredo nao e enviado a terceiros.

- segredo aleatorio exclusivo por usuario;
- QR Code gerado localmente pelo servidor;
- segredo criptografado com AES-256-GCM antes de ser salvo;
- codigo de 6 digitos, periodo de 30 segundos e tolerancia maxima de uma janela adjacente;
- bloqueio da reutilizacao do mesmo passo TOTP;
- oito codigos de recuperacao, exibidos uma unica vez e persistidos apenas como hash;
- nova ativacao incrementa `sessionVersion` e exige novo login.

`AUTH_ENCRYPTION_KEY` deve ser uma chave Base64 com exatamente 32 bytes. Trocar essa chave sem um procedimento de rotacao invalida os segredos TOTP existentes.

## Senhas e convites

- senhas sao armazenadas somente com bcrypt;
- `BCRYPT_ROUNDS` deve ser pelo menos 12 em PRD;
- senhas exigem ao menos 12 caracteres, maiuscula, minuscula e numero, respeitando o limite de 72 bytes do bcrypt;
- a troca de senha exige senha atual e segundo fator recente, incrementa `sessionVersion` e derruba todas as sessoes;
- convites sao de uso unico, expiram, guardam apenas o hash do token e so podem ser emitidos pelo master;
- em PRD, o link e enviado por provedor transacional e nunca e retornado pela API;
- o sistema limita o total de contas por `ADMIN_USER_LIMIT` (padrao 10, limite maximo 50);
- o seed nao possui senha padrao e falha sem `SEED_ADMIN_PASSWORD` com ao menos 12 caracteres.

## Protecoes adicionais

- respostas de credencial invalida sao genericas;
- um hash bcrypt ficticio reduz diferenca de tempo para e-mails inexistentes;
- rate limit em memoria reduz rajadas na instancia atual;
- auditoria persistente bloqueia repeticoes por IP e identificador entre requisicoes;
- tentativas, sucessos, ativacao MFA e recuperacao sao auditados sem senha, TOTP, segredo ou token puro;
- usuario inativo ou com versao de sessao divergente perde acesso;
- paginas administrativas usam `no-store`, `noindex`, HSTS em producao e cabecalhos contra embedding e sniffing;
- rotas administrativas validam sessao e MFA no servidor, sem confiar apenas no middleware.

## Variaveis obrigatorias em PRD

```env
DATABASE_URL=""
DIRECT_URL=""
NEXTAUTH_URL="https://dominio-oficial"
NEXT_PUBLIC_APP_URL="https://dominio-oficial"
APP_URL="https://dominio-oficial"
NEXTAUTH_SECRET="minimo-32-caracteres"
TOKEN_PEPPER="minimo-32-caracteres"
ADMIN_ACCESS_KEY="minimo-16-caracteres"
AUTH_ENCRYPTION_KEY="base64-de-32-bytes"
ADMIN_ALLOWED_EMAILS="admin-legado@dominio.com" # apenas bootstrap/migracao
ADMIN_USER_LIMIT="10"
RESEND_API_KEY="..."
AUTH_EMAIL_FROM="Brookie Pregiato <acessos@dominio-validado.com>"
BCRYPT_ROUNDS="12"
INVITE_EXPIRY_HOURS="24"
```

Em PRD a aplicacao falha fechada se a configuracao criptografica critica estiver incompleta. A lista de bootstrap nao autoriza login; contas ativas no banco, MFA e versao de sessao sao a fonte de verdade.

Segredos devem ser gerados localmente, salvos no gerenciador da Vercel e nunca registrados em logs ou no Git.

## Banco de dados

A migration `20260813103000_add_admin_mfa_hardening` adiciona ao `AdminUser`:

- `ativo` e `sessionVersion`;
- segredo TOTP ativo e pendente, ambos criptografados;
- expiracao do segredo pendente e data de ativacao;
- ultimo passo TOTP consumido;
- hashes dos codigos de recuperacao.

Ela tambem inclui os novos eventos MFA em `AuthAuditAction`.

A migration `20260814003000_add_admin_roles_and_auth_audit` adiciona `MASTER/ADMIN`, promove o e-mail do Joao a master e registra desafios de senha, troca de senha, entrega/revogacao de convites e ativacao de usuarios.

## Implantacao segura

1. Confirmar o usuario master e o limite de contas administrativas.
2. Criar segredos distintos para HML e PRD na Vercel.
3. Fazer snapshot da branch de banco HML.
4. Aplicar a migration somente em HML e regenerar o Prisma Client.
5. Garantir que apenas contas individuais aprovadas estejam ativas e com e-mail normalizado correto.
6. Validar em HML: chave previa, senha incorreta, separacao das duas telas, desafio expirado, TOTP repetido, recuperacao, troca de senha e revogacao de sessoes.
7. Validar convite master: entrega do e-mail, link expirado/uso unico, usuario inativo antes do MFA, ativacao e revogacao.
8. Abrir e revisar o PR.
9. Somente depois da aprovacao explicita: snapshot PRD, migration PRD, deploy e smoke test dos administradores.

Nunca aplicar a migration em PRD antes da validacao completa em HML.

## Recuperacao de acesso

Os codigos de recuperacao devem ficar em um cofre de senhas, separados da senha principal. Se um administrador perder autenticador e codigos, a recuperacao deve ser feita pelo outro administrador em procedimento auditado; nunca desabilitando MFA publicamente ou compartilhando credenciais.

## Validacao local

```bash
npm run test:auth-security
npm run lint
npm run build
npm audit
```

Os testes cobrem TOTP, tolerancia temporal, criptografia e adulteracao, URI do autenticador, recuperacao, desafio criptografado entre as duas telas, politica de senha, limite de usuarios e assinatura do cookie de pre-acesso.
