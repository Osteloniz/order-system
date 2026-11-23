import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const workspaceRoot = resolve(projectRoot, '..')
const vaultRoot = resolve(process.argv[2] || process.env.BROOKIE_OBSIDIAN_VAULT || 'E:\\cofre-obsidian')
if (!existsSync(vaultRoot)) throw new Error(`Cofre não encontrado: ${vaultRoot}`)
const brookieRoot = join(vaultRoot, 'Projetos', 'Brookie')

const sources = [
  ['AGENTS-WORKSPACE.md', join(workspaceRoot, 'AGENTS.md')],
  ['AGENTS-PROJETO.md', join(projectRoot, 'AGENTS.md')],
  ['PROJECT_CONTEXT.md', join(projectRoot, 'PROJECT_CONTEXT.md')],
  ['SECURITY_AUTH.md', join(projectRoot, 'SECURITY_AUTH.md')],
  ['README.md', join(projectRoot, 'README.md')],
  ['PROMPTINICIAL.md', join(projectRoot, 'PROMPTINICIAL.md')],
  ['API.md', join(projectRoot, 'docs', 'API.md')],
  ['DB.md', join(projectRoot, 'docs', 'DB.md')],
  ['DEPLOY.md', join(projectRoot, 'docs', 'DEPLOY.md')],
  ['PRD.md', join(projectRoot, 'docs', 'PRD.md')],
  ['NEON.md', join(projectRoot, 'docs', 'NEON.md')],
  ['MULTI_TENANT.md', join(projectRoot, 'docs', 'MULTI_TENANT.md')],
  ['BROOKIE_BRAND_UI.md', join(projectRoot, 'docs', 'BROOKIE_BRAND_UI.md')],
  ['BROOKIE_TECHNICAL_HANDOFF.md', join(projectRoot, 'docs', 'BROOKIE_TECHNICAL_HANDOFF.md')],
  ['caixa-express-v1.md', join(projectRoot, 'docs', 'caixa-express-v1.md')],
  ['captura-documentos-financeiros.md', join(projectRoot, 'docs', 'captura-documentos-financeiros.md')],
  ['admin-mobile-order-flow-handoff.md', join(projectRoot, 'docs', 'admin-mobile-order-flow-handoff.md')],
  ['hml-checklist-checkout-publico-seguranca.md', join(projectRoot, 'docs', 'hml-checklist-checkout-publico-seguranca.md')],
  ['hml-mercado-pago-checkout-pro.md', join(projectRoot, 'docs', 'hml-mercado-pago-checkout-pro.md')],
  ['neon-staging-e-rollback.md', join(projectRoot, 'docs', 'neon-staging-e-rollback.md')],
  ['processo-atualizacao-banco-prd.md', join(projectRoot, 'docs', 'processo-atualizacao-banco-prd.md')],
  ['prd-go-live-asaas-dominio-checklist.md', join(projectRoot, 'docs', 'prd-go-live-asaas-dominio-checklist.md')],
  ['logs-retencao.md', join(projectRoot, 'docs', 'logs-retencao.md')],
]

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content.replace(/\r\n/g, '\n'), 'utf8')
}
const writeIfMissing = (path, content) => {
  if (!existsSync(path)) write(path, content)
}
const hash = (content) => createHash('sha256').update(content).digest('hex')
const date = new Date().toISOString()
const copied = []
for (const [targetName, sourcePath] of sources) {
  if (!existsSync(sourcePath)) continue
  const content = readFileSync(sourcePath, 'utf8')
  write(join(brookieRoot, '80 Referencias do Projeto', targetName), content)
  copied.push({ targetName, sourcePath: relative(workspaceRoot, sourcePath).split(sep).join('/'), sha256: hash(content) })
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? walk(path) : [path]
})
const apiRoutes = walk(join(projectRoot, 'app', 'api')).filter((path) => basename(path) === 'route.ts').map((path) => relative(join(projectRoot, 'app'), path).split(sep).join('/')).sort()
const migrations = readdirSync(join(projectRoot, 'prisma', 'migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
const schema = readFileSync(join(projectRoot, 'prisma', 'schema.prisma'), 'utf8')
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
let gitStatus = 'Indisponível'
try { gitStatus = execFileSync('git', ['status', '--short'], { cwd: projectRoot, encoding: 'utf8' }).trim() || 'Árvore limpa' } catch {}

writeIfMissing(join(brookieRoot, '00 Início', 'Brookie MOC.md'), `---
tipo: moc
projeto: Brookie
atualizado_em: ${date}
tags: [brookie, sistema, contexto]
---
# Brookie

Este é o ponto de entrada do conhecimento compartilhado do Sistema Brookie.

## Começar por aqui

- [[01 Contexto/Visão geral do sistema|Visão geral do sistema]]
- [[01 Contexto/Regras de negócio confirmadas|Regras de negócio confirmadas]]
- [[02 Engenharia/Arquitetura e mapa técnico|Arquitetura e mapa técnico]]
- [[03 Operação/Fluxo de desenvolvimento e release|Fluxo de desenvolvimento e release]]
- [[04 Decisões/Registro de decisões|Registro de decisões]]
- [[05 Pendências/Pendências atuais|Pendências atuais]]
- [[90 Skills/Skills Brookie|Skills Brookie]]
- [[99 Sistema/Configuração no Linux|Configuração no Linux]]
- [[80 Referencias do Projeto/PROJECT_CONTEXT|Contexto original do projeto]]

## Regra de manutenção

O repositório continua sendo a fonte do código. Este cofre é a fonte compartilhada de contexto, decisões, operação e continuidade entre Windows e Linux. Ao terminar uma mudança relevante, atualize as notas vivas e execute o sincronizador do contexto.
`)

writeIfMissing(join(brookieRoot, '01 Contexto', 'Visão geral do sistema.md'), `---
tipo: contexto
projeto: Brookie
status: vivo
atualizado_em: ${date}
---
# Visão geral do sistema

O Sistema Brookie reúne catálogo, menu público, checkout, pedidos, clientes, fidelidade, estoque, produção, financeiro e relatórios em uma aplicação multi tenant. A Brookie Pregiato é o tenant operacional atual.

## Stack

- Next.js ${pkg.dependencies.next} com App Router
- React ${pkg.dependencies.react}
- Prisma ${pkg.devDependencies.prisma} e PostgreSQL no Neon
- NextAuth com credenciais, MFA TOTP e sessão administrativa
- Tailwind CSS e componentes Radix

## Domínios principais

- Menu público e checkout
- Pedidos, KDS e atendimento manual
- Clientes e fidelidade
- Produtos, categorias, cupons e estoque
- Contas a pagar, receber, fluxo de caixa e relatórios
- Autenticação, permissões, auditoria e isolamento por tenant

## Fontes detalhadas

- [[../80 Referencias do Projeto/PROJECT_CONTEXT|PROJECT_CONTEXT]]
- [[../80 Referencias do Projeto/BROOKIE_TECHNICAL_HANDOFF|Handoff técnico]]
- [[../80 Referencias do Projeto/API|API]]
- [[../80 Referencias do Projeto/DB|Banco de dados]]
- [[../80 Referencias do Projeto/MULTI_TENANT|Multi tenant]]
`)

writeIfMissing(join(brookieRoot, '01 Contexto', 'Regras de negócio confirmadas.md'), `---
tipo: regras-negocio
projeto: Brookie
status: vivo
atualizado_em: ${date}
---
# Regras de negócio confirmadas

Registre aqui somente regras confirmadas pelo responsável ou comprovadas no comportamento vigente. Propostas e rascunhos permanecem na demanda correspondente até aprovação.

## Segurança de dados

- Não inventar saldos, pesos ou custos ausentes.
- Não alterar PRD, credenciais ou excluir dados sem autorização explícita.
- Toda mutação administrativa protege tenant, sessão, MFA, origem, concorrência e auditoria conforme o risco.

Fontes técnicas: [[../80 Referencias do Projeto/PROJECT_CONTEXT|PROJECT_CONTEXT]] e [[../80 Referencias do Projeto/API|API]].
`)

write(join(brookieRoot, '02 Engenharia', 'Arquitetura e mapa técnico.md'), `---
tipo: arquitetura
projeto: Brookie
status: gerado
atualizado_em: ${date}
---
# Arquitetura e mapa técnico

## Aplicação

- Raiz do projeto: \`order-system/\`
- Rotas de interface: \`app/\`
- APIs: \`app/api/\`
- Componentes: \`components/\`
- Regras compartilhadas: \`lib/\`
- Persistência: \`prisma/schema.prisma\` e \`prisma/migrations/\`
- Testes: \`tests/\`

## Inventário

- ${apiRoutes.length} arquivos de rota de API
- ${migrations.length} diretórios de migração
- ${Object.keys(pkg.dependencies).length} dependências de runtime

## Referências

- [[Schema Prisma]]
- [[Inventário de APIs]]
- [[Inventário de migrações]]
- [[../80 Referencias do Projeto/API|Contrato de API mantido no projeto]]
- [[../80 Referencias do Projeto/SECURITY_AUTH|Segurança administrativa]]
`)
write(join(brookieRoot, '02 Engenharia', 'Schema Prisma.md'), `---
tipo: schema
projeto: Brookie
gerado_em: ${date}
fonte: order-system/prisma/schema.prisma
---
# Schema Prisma

> Snapshot para consulta. Edite o schema no repositório e execute a sincronização para atualizar esta nota.

\`\`\`prisma
${schema}
\`\`\`
`)
write(join(brookieRoot, '02 Engenharia', 'Inventário de APIs.md'), `---
tipo: inventario-api
projeto: Brookie
gerado_em: ${date}
---
# Inventário de APIs

${apiRoutes.map((route) => `- \`${route}\``).join('\n')}
`)
write(join(brookieRoot, '02 Engenharia', 'Inventário de migrações.md'), `---
tipo: inventario-migracoes
projeto: Brookie
gerado_em: ${date}
---
# Inventário de migrações

${migrations.map((migration) => `- \`${migration}\``).join('\n')}
`)

writeIfMissing(join(brookieRoot, '03 Operação', 'Fluxo de desenvolvimento e release.md'), `---
tipo: processo
projeto: Brookie
status: obrigatório
atualizado_em: ${date}
---
# Fluxo de desenvolvimento e release

1. Ler [[../00 Início/Brookie MOC|Brookie MOC]], o contexto relevante e as notas vivas.
2. Registrar a intenção da sessão em [[Sessões de trabalho]] quando a mudança for material.
3. Alterar e validar localmente.
4. Aplicar e validar migração em HML quando schema ou migrações mudarem.
5. Validar localmente contra HML conforme o fluxo do projeto.
6. Atualizar documentação, decisão e pendências no cofre.
7. Executar \`rtk node scripts/sync-obsidian-context.mjs "<caminho-do-cofre>"\`.
8. Push, migração PRD e deploy só dentro da autorização concedida.

## Caminhos do cofre

- Windows atual: \`E:\\cofre-obsidian\`
- Linux: configurar \`BROOKIE_OBSIDIAN_VAULT\` com o caminho local sincronizado e executar o mesmo script sem argumento.

## Segurança

- Nunca copiar \`.env\`, tokens, cookies, senhas, segredos MFA ou credenciais para o Obsidian.
- O cofre não substitui Git, Prisma migrations ou o banco.
- Dados de produção devem ser descritos sem valores sensíveis ou dados pessoais desnecessários.

Consulte também [[../80 Referencias do Projeto/DEPLOY|Deploy]], [[../80 Referencias do Projeto/PRD|PRD]] e [[../80 Referencias do Projeto/neon-staging-e-rollback|Neon HML e rollback]].
`)
writeIfMissing(join(brookieRoot, '03 Operação', 'Sessões de trabalho.md'), `---
tipo: indice-sessoes
projeto: Brookie
---
# Sessões de trabalho

Crie uma nota por sessão material em \`03 Operação/Sessões/AAAA-MM-DD assunto.md\` usando [[../../95 Templates/Registro de sessão|Registro de sessão]]. Registre objetivo, arquivos alterados, testes, migrações, riscos, decisões e próximos passos.
`)

writeIfMissing(join(brookieRoot, '04 Decisões', 'Registro de decisões.md'), `---
tipo: indice-decisoes
projeto: Brookie
status: vivo
atualizado_em: ${date}
---
# Registro de decisões

- O repositório é a fonte do código; o Obsidian é a fonte compartilhada de contexto e decisões.
- HML vem antes de PRD para alterações persistentes.
- Demandas materiais passam por antecipação e refinamento antes da implementação.
- Entregas Brookie usam a skill de qualidade para coordenar implementação, HML, revisão e continuidade.

Para uma decisão material nova, crie uma nota a partir de [[../../95 Templates/Decisão técnica e de negócio|Decisão técnica e de negócio]] e vincule aqui.
`)

writeIfMissing(join(brookieRoot, '05 Pendências', 'Pendências atuais.md'), `---
tipo: pendencias
projeto: Brookie
status: vivo
atualizado_em: ${date}
---
# Pendências atuais

Nenhuma pendência foi registrada ainda. Atualize esta nota com fatos, responsável e próxima ação; não copie automaticamente uma lista de rascunho.
`)

writeIfMissing(join(brookieRoot, '95 Templates', 'Registro de sessão.md'), `---
tipo: sessao
projeto: Brookie
data: {{date}}
status: em-andamento
---
# {{date}} assunto

## Objetivo

## Contexto consultado

## Alterações

## Testes e evidências

## Migrações e ambientes

## Decisões

## Riscos e limitações

## Próximos passos
`)
writeIfMissing(join(brookieRoot, '95 Templates', 'Decisão técnica e de negócio.md'), `---
tipo: decisao
projeto: Brookie
data: {{date}}
status: proposta
---
# Decisão

## Contexto

## Decisão

## Motivos e evidências

## Impactos

## Alternativas consideradas

## Validação necessária
`)

write(join(brookieRoot, '99 Sistema', 'Estado local da última sincronização.md'), `---
tipo: estado-local
projeto: Brookie
gerado_em: ${date}
maquina: windows
---
# Estado local da última sincronização

> Snapshot informativo. O Git continua sendo a fonte do estado do código.

\`\`\`text
${gitStatus}
\`\`\`
`)
writeIfMissing(join(brookieRoot, '99 Sistema', 'Configuração no Linux.md'), `---
tipo: configuracao
projeto: Brookie
plataforma: linux
---
# Configuração no Linux

O cofre é sincronizado entre as máquinas. Na máquina Linux, aponte o projeto para a cópia local do cofre:

\`\`\`bash
export BROOKIE_OBSIDIAN_VAULT="/caminho/local/cofre-obsidian"
\`\`\`

Instale as skills compartilhadas como links simbólicos, sem substituir diretórios já existentes:

\`\`\`bash
mkdir -p "$HOME/.codex/skills"
for skill in brookie-contexto brookie-dados-seguranca brookie-pedidos brookie-ui-ux brookie-operacao-release brookie-entrega-qualidade brookie-caixa-operacao; do
  ln -s "$BROOKIE_OBSIDIAN_VAULT/Projetos/Brookie/90 Skills/$skill" "$HOME/.codex/skills/$skill"
done
\`\`\`

Para atualizar os snapshots técnicos a partir do repositório:

\`\`\`bash
rtk node scripts/sync-obsidian-context.mjs
\`\`\`

Execute o comando dentro de \`order-system/\`. As notas vivas já existentes são preservadas; referências e inventários técnicos são atualizados.
`)
write(join(brookieRoot, '99 Sistema', 'Manifesto de sincronização.json'), `${JSON.stringify({ generatedAt: date, projectRoot, copied }, null, 2)}\n`)

console.log(JSON.stringify({ vaultRoot, brookieRoot, copied: copied.length, apiRoutes: apiRoutes.length, migrations: migrations.length }, null, 2))
