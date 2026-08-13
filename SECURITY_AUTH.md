# Seguranca do acesso administrativo

## Regra operacional

O painel e restrito a exatamente duas pessoas reais, ambas administradoras. Nao existe cadastro publico e nao deve ser criada conta para assistentes de IA, contas compartilhadas ou e-mails fora de `ADMIN_ALLOWED_EMAILS`.

O segundo administrador deve ser outra pessoa de confianca, com e-mail, senha, autenticador e codigos de recuperacao proprios.

## Fluxo de acesso

1. Em producao, `/admin` exige a chave previa `ADMIN_ACCESS_KEY`.
2. A chave correta gera um cookie assinado, aleatorio, `HttpOnly`, `Secure` e valido por no maximo 12 horas; o valor literal da chave nunca e salvo no cookie.
3. O login aceita somente e-mail autorizado e senha.
4. No primeiro acesso, o usuario entra apenas em `/admin/seguranca` para vincular um autenticador.
5. Depois da ativacao, cada login exige senha e um codigo TOTP ou codigo de recuperacao de uso unico.
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
- novos cadastros exigem senha entre 12 e 128 caracteres;
- convites sao de uso unico, expiram, guardam apenas o hash do token e somente podem ser emitidos para os dois e-mails da allowlist;
- o sistema impede a criacao de um terceiro usuario ativo;
- o seed nao possui senha padrao e falha sem `SEED_ADMIN_PASSWORD` com ao menos 12 caracteres.

## Protecoes adicionais

- respostas de credencial invalida sao genericas;
- um hash bcrypt ficticio reduz diferenca de tempo para e-mails inexistentes;
- rate limit em memoria reduz rajadas na instancia atual;
- auditoria persistente bloqueia repeticoes por IP e identificador entre requisicoes;
- tentativas, sucessos, ativacao MFA e recuperacao sao auditados sem senha, TOTP, segredo ou token puro;
- usuario inativo, removido da allowlist ou com versao de sessao divergente perde acesso;
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
ADMIN_ALLOWED_EMAILS="admin1@dominio.com,admin2@dominio.com"
BCRYPT_ROUNDS="12"
INVITE_EXPIRY_HOURS="24"
```

Em PRD a aplicacao falha fechada se a configuracao critica estiver incompleta ou se a allowlist nao contiver exatamente dois e-mails unicos.

Segredos devem ser gerados localmente, salvos no gerenciador da Vercel e nunca registrados em logs ou no Git.

## Banco de dados

A migration `20260813103000_add_admin_mfa_hardening` adiciona ao `AdminUser`:

- `ativo` e `sessionVersion`;
- segredo TOTP ativo e pendente, ambos criptografados;
- expiracao do segredo pendente e data de ativacao;
- ultimo passo TOTP consumido;
- hashes dos codigos de recuperacao.

Ela tambem inclui os novos eventos MFA em `AuthAuditAction`.

## Implantacao segura

1. Definir os dois e-mails humanos autorizados.
2. Criar segredos distintos para HML e PRD na Vercel.
3. Fazer snapshot da branch de banco HML.
4. Aplicar a migration somente em HML e regenerar o Prisma Client.
5. Garantir que somente os dois usuarios autorizados estejam ativos e com e-mail normalizado correto.
6. Validar em HML: chave previa, senha incorreta, vinculo MFA, novo login TOTP, rejeicao de codigo repetido, recuperacao, logout e bloqueio do terceiro usuario.
7. Abrir e revisar o PR.
8. Somente depois da aprovacao explicita: snapshot PRD, migration PRD, deploy e smoke test dos dois administradores.

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

Os testes cobrem TOTP, tolerancia temporal, criptografia e adulteracao, URI do autenticador, recuperacao, allowlist de duas pessoas e assinatura do cookie de pre-acesso.
