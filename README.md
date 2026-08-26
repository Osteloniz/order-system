# Brookie Pregiato

Aplicação de gestão e pedidos da Brookie Pregiato, com experiência de compra para clientes e operação administrativa para a equipe autorizada.

## Visão geral

O sistema reúne, em uma única aplicação:

- cardápio e checkout para clientes;
- gestão operacional de pedidos;
- produtos, estoque e produção;
- clientes e fornecedores;
- rotinas financeiras e relatórios;
- configurações administrativas.

A interface segue uma abordagem mobile first e a identidade visual oficial da Brookie.

## Tecnologias

- Next.js e React;
- TypeScript;
- Prisma;
- PostgreSQL;
- autenticação administrativa com múltiplos fatores.

Versões, dependências e comandos disponíveis devem ser consultados diretamente nos arquivos de configuração do projeto.

## Segurança

Este sistema processa dados comerciais e informações de clientes. O acesso ao código, aos ambientes e à documentação operacional deve seguir o princípio do menor privilégio.

- Não registre credenciais, tokens, chaves, códigos MFA ou strings de conexão no Git.
- Não publique usuários administrativos, URLs internas ou procedimentos de recuperação de acesso.
- Use somente variáveis de ambiente configuradas nos provedores autorizados.
- Mantenha autenticação multifator habilitada para todas as contas administrativas.
- Faça rotação imediata de qualquer credencial que possa ter sido exposta.
- Comunique vulnerabilidades diretamente aos responsáveis pelo projeto; não abra uma discussão pública com detalhes exploráveis.

## Desenvolvimento e entrega

O desenvolvimento é destinado a mantenedores autorizados. Instruções de ambiente, banco de dados, autenticação, integrações e deploy são mantidas em documentação privada e não devem ser copiadas para materiais públicos.

O fluxo de entrega segue, em alto nível:

1. desenvolvimento e validação local;
2. validação no ambiente de homologação;
3. revisão por pull request;
4. liberação controlada em produção;
5. verificação pós-deploy.

Mudanças de banco de dados exigem validação e plano de rollback antes da produção.

## Contribuição

Antes de propor alterações:

- confirme a autorização para acessar o projeto;
- preserve a compatibilidade dos dados existentes;
- não inclua informações reais de clientes em testes, capturas ou exemplos;
- execute as validações automatizadas aplicáveis;
- descreva riscos de segurança, impacto em dados e necessidade de migration no pull request.

## Documentação

Runbooks, arquitetura detalhada, inventário de APIs, configuração de ambientes e procedimentos de segurança são materiais internos. O acesso deve ser concedido apenas a pessoas autorizadas e por um canal privado.
