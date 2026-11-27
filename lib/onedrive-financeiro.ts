import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { type Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DocumentoFinanceiroErro } from '@/lib/documento-financeiro-arquivo'
import type { ArquivosFinanceiros } from '@/lib/documentos-financeiros'

const authority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const graphBase = 'https://graph.microsoft.com/v1.0'
const scope = 'offline_access https://graph.microsoft.com/Files.ReadWrite.AppFolder'
export const cookieOneDrive = '__onedrive_financeiro'
export const estadoOneDriveSegundos = 600
export const callbackOneDrive = '/api/admin/integracoes/onedrive/callback'
export const caminhoFinanceiro = '/admin/financeiro/contas-pagar'
export const limiteTransporteFinanceiro = 4 * 1024 * 1024
export const regexEstado = /^[A-Za-z0-9_-]{43}$/
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

type Ator = { tenantId: string; adminUserId: string }
type Sessao = Ator & { sessaoId: string }
type Operacao = { acesso: string; driveId: string; pastaId: string }

export function configuracaoOneDrive() {
  const clientId = process.env.ONEDRIVE_CLIENT_ID
  const secret = process.env.ONEDRIVE_CLIENT_SECRET
  const redirect = process.env.ONEDRIVE_REDIRECT_URI
  const key = Buffer.from(process.env.ONEDRIVE_TOKEN_ENCRYPTION_KEY ?? '', 'base64')
  if (!clientId || !z.string().uuid().safeParse(clientId).success || !secret || !redirect || key.length !== 32) return null
  if (process.env.VERCEL_ENV === 'production') return null
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF !== 'develop') return null
  try {
    const url = new URL(redirect)
    const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if ((!loopback && url.protocol !== 'https:') || url.pathname !== callbackOneDrive ||
        url.search || url.hash || url.username || url.password || url.href !== redirect) return null
    return { clientId, secret, redirect, key, origin: url.origin }
  } catch {
    return null
  }
}

export function exigirOneDrive() {
  const config = configuracaoOneDrive()
  if (!config) throw new DocumentoFinanceiroErro('OneDrive indisponível neste ambiente', 503)
  return config
}

type Config = ReturnType<typeof exigirOneDrive>

function cifrar(config: Config, value: string, contexto: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', config.key, iv)
  cipher.setAAD(Buffer.from(contexto))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decifrar(config: Config, value: string, contexto: string) {
  const bytes = Buffer.from(value, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', config.key, bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(contexto))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
}

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().max(86_400),
  token_type: z.string().refine((x) => x.toLowerCase() === 'bearer'),
})

async function trocarToken(config: Config, input: Record<string, string>) {
  const response = await fetch(authority + '/token', {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6500),
    body: new URLSearchParams({
      client_id: config.clientId, client_secret: config.secret, scope,
      redirect_uri: config.redirect, ...input,
    }),
  }).catch(() => null)
  if (!response) throw new DocumentoFinanceiroErro('A Microsoft não respondeu. Tente novamente', 502)
  const dados: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (z.object({ error: z.literal('invalid_grant') }).safeParse(dados).success) return null
    throw new DocumentoFinanceiroErro('Não foi possível autorizar o OneDrive', 502)
  }
  const tokens = tokensSchema.safeParse(dados)
  if (!tokens.success) throw new DocumentoFinanceiroErro('A Microsoft retornou uma autorização inválida', 502)
  return tokens.data
}

function grafico(token: string, path: string, request: RequestInit = {}) {
  const headers = new Headers(request.headers)
  headers.set('Authorization', 'Bearer ' + token)
  return fetch(graphBase + path, {
    ...request, headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000),
  }).catch(() => { throw new DocumentoFinanceiroErro('OneDrive indisponível. Tente novamente', 502) })
}

const itemSchema = z.object({
  id: z.string().min(1).max(512),
  folder: z.object({}).optional(),
  file: z.object({}).optional(),
  parentReference: z.object({ driveId: z.string().min(1).max(512) }).optional(),
})

async function obterItem(response: Response) {
  if (!response.ok) throw erroGraph(response.status)
  const item = itemSchema.safeParse(await response.json().catch(() => null))
  if (!item.success) throw new DocumentoFinanceiroErro('OneDrive retornou um item inválido', 502)
  return item.data
}

function erroGraph(status: number) {
  if (status === 401 || status === 403) return new DocumentoFinanceiroErro('Peça ao MASTER para reconectar o OneDrive', 409)
  if (status === 507) return new DocumentoFinanceiroErro('O OneDrive está sem espaço', 409)
  return new DocumentoFinanceiroErro('Não foi possível acessar o OneDrive. Tente novamente', 502)
}

async function travarTenant(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR NO KEY UPDATE`
}

export async function iniciarOneDrive(ator: Sessao, config: Config) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const stateHash = sha256(state)
  await prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator.tenantId)
    await tx.oneDriveAutorizacao.deleteMany({
      where: { tenantId: ator.tenantId, OR: [{ adminId: ator.adminUserId }, { expiraEm: { lte: new Date() } }] },
    })
    await tx.oneDriveAutorizacao.create({
      data: {
        stateHash, tenantId: ator.tenantId, adminId: ator.adminUserId, sessaoId: ator.sessaoId,
        expiraEm: new Date(Date.now() + estadoOneDriveSegundos * 1000),
        verifierCifrado: cifrar(config, verifier, stateHash + ':verifier'),
      },
    })
  })
  const url = new URL(authority + '/authorize')
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirect, response_type: 'code',
    response_mode: 'query', scope, state, prompt: 'select_account',
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString()
  return { state, url: url.href }
}

export async function guardarRetornoOneDrive(config: Config, state: string, code: string) {
  const stateHash = sha256(state)
  const result = await prisma.oneDriveAutorizacao.updateMany({
    where: { stateHash, expiraEm: { gt: new Date() }, codigoCifrado: null },
    data: { codigoCifrado: cifrar(config, code, stateHash + ':codigo') },
  })
  return result.count === 1
}

export async function concluirOneDrive(ator: Sessao, config: Config, state: string) {
  const stateHash = sha256(state)
  const resultado = await prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator.tenantId)
    const autorizacao = await tx.oneDriveAutorizacao.findFirst({
      where: {
        stateHash, tenantId: ator.tenantId, adminId: ator.adminUserId, sessaoId: ator.sessaoId,
        expiraEm: { gt: new Date() }, codigoCifrado: { not: null },
      },
    })
    if (!autorizacao?.codigoCifrado) return 'INVALIDO'
    await tx.oneDriveAutorizacao.delete({ where: { stateHash } })
    // Commit da exclusão mesmo se a Microsoft rejeitar o código.
    try {
      const tokens = await trocarToken(config, {
        grant_type: 'authorization_code', code: decifrar(config, autorizacao.codigoCifrado, stateHash + ':codigo'),
        code_verifier: decifrar(config, autorizacao.verifierCifrado, stateHash + ':verifier'),
      })
      if (!tokens?.refresh_token) return 'INVALIDO'
      const pasta = await obterItem(await grafico(tokens.access_token, '/me/drive/special/approot'))
      const driveId = pasta.parentReference?.driveId
      if (!pasta.folder || !driveId) return 'INVALIDO'
      const anterior = await tx.oneDriveFinanceiro.findUnique({ where: { tenantId: ator.tenantId } })
      if (anterior && anterior.driveId !== driveId) return 'OUTRO_DRIVE'
      const data = {
        driveId, pastaId: pasta.id,
        acessoCifrado: cifrar(config, tokens.access_token, ator.tenantId + ':acesso'),
        renovacaoCifrada: cifrar(config, tokens.refresh_token, ator.tenantId + ':renovacao'),
        acessoExpiraEm: new Date(Date.now() + tokens.expires_in * 1000),
      }
      await tx.oneDriveFinanceiro.upsert({
        where: { tenantId: ator.tenantId }, create: { tenantId: ator.tenantId, ...data }, update: data,
      })
      await tx.oneDriveEvento.create({
        data: { tenantId: ator.tenantId, adminId: ator.adminUserId, acao: 'CONECTADO' },
      })
      return 'OK'
    } catch (error) {
      if (error instanceof DocumentoFinanceiroErro) return 'MICROSOFT'
      throw error
    }
  }, { maxWait: 5000, timeout: 22_000 })
  if (resultado === 'OUTRO_DRIVE') throw new DocumentoFinanceiroErro('Use a mesma conta Microsoft vinculada ao histórico', 409)
  if (resultado !== 'OK') throw new DocumentoFinanceiroErro('Conexão não concluída. Inicie novamente pelo Brookie', 409)
}

export async function desconectarOneDrive(ator: Ator) {
  await prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator.tenantId)
    await tx.oneDriveAutorizacao.deleteMany({ where: { tenantId: ator.tenantId } })
    const result = await tx.oneDriveFinanceiro.updateMany({
      where: { tenantId: ator.tenantId, renovacaoCifrada: { not: null } },
      data: { acessoCifrado: null, renovacaoCifrada: null, acessoExpiraEm: null },
    })
    if (result.count) await tx.oneDriveEvento.create({
      data: { tenantId: ator.tenantId, adminId: ator.adminUserId, acao: 'DESCONECTADO' },
    })
  })
}

export async function estadoOneDrive(tenantId: string) {
  if (!configuracaoOneDrive()) return 'INDISPONIVEL'
  const registro = await prisma.oneDriveFinanceiro.findUnique({
    where: { tenantId }, select: { acessoExpiraEm: true },
  })
  return registro?.acessoExpiraEm ? 'CONECTADO' : 'DESCONECTADO'
}

async function autorizacaoGraph(ator: Ator, config: Config): Promise<Operacao> {
  const operacao = await prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator.tenantId)
    const conexao = await tx.oneDriveFinanceiro.findUnique({ where: { tenantId: ator.tenantId } })
    if (!conexao?.renovacaoCifrada) return null
    if (conexao.acessoCifrado && conexao.acessoExpiraEm && conexao.acessoExpiraEm.getTime() > Date.now() + 60_000) {
      return { acesso: decifrar(config, conexao.acessoCifrado, ator.tenantId + ':acesso'),
        driveId: conexao.driveId, pastaId: conexao.pastaId }
    }
    const tokens = await trocarToken(config, {
      grant_type: 'refresh_token',
      refresh_token: decifrar(config, conexao.renovacaoCifrada, ator.tenantId + ':renovacao'),
    })
    await tx.oneDriveFinanceiro.update({
      where: { tenantId: ator.tenantId },
      data: tokens ? {
        acessoCifrado: cifrar(config, tokens.access_token, ator.tenantId + ':acesso'),
        renovacaoCifrada: tokens.refresh_token
          ? cifrar(config, tokens.refresh_token, ator.tenantId + ':renovacao') : conexao.renovacaoCifrada,
        acessoExpiraEm: new Date(Date.now() + tokens.expires_in * 1000),
      } : { acessoCifrado: null, renovacaoCifrada: null, acessoExpiraEm: null },
    })
    if (!tokens) {
      await tx.oneDriveEvento.create({
        data: { tenantId: ator.tenantId, adminId: ator.adminUserId, acao: 'RENOVACAO_INVALIDA' },
      })
      return null
    }
    return { acesso: tokens.access_token, driveId: conexao.driveId, pastaId: conexao.pastaId }
  }, { maxWait: 5000, timeout: 12_000 })
  if (!operacao) throw new DocumentoFinanceiroErro('Peça ao MASTER para conectar o OneDrive', 409)
  return operacao
}

const segmento = (value: string) => encodeURIComponent(value)
const localizar = (op: Operacao, itemId: string) => '/drives/' + segmento(op.driveId) + '/items/' + segmento(itemId)

async function garantirPasta(op: Operacao, pai: string, nome: string) {
  const path = localizar(op, pai)
  const ler = () => grafico(op.acesso, path + ':/' + segmento(nome))
  const existente = await ler()
  const resposta = existente.status === 404 ? await grafico(op.acesso, path + '/children', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  }) : existente
  const pasta = await obterItem(resposta.status === 409 ? await ler() : resposta)
  if (!pasta.folder) throw new DocumentoFinanceiroErro('A pasta de documentos do OneDrive está indisponível', 409)
  return pasta.id
}

async function lerConteudo(op: Operacao, itemId: string) {
  const response = await grafico(op.acesso, localizar(op, itemId) + '/content')
  if (response.status === 404 || response.status === 410) return null
  if (response.status !== 302) {
    if (!response.ok) throw erroGraph(response.status)
    return response.body
  }
  const location = response.headers.get('location')
  const url = location ? new URL(location) : null
  const host = url?.hostname.toLowerCase()
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      !host || !['1drv.com', 'onedrive.com', 'live.com'].some((base) => host === base || host.endsWith('.' + base))) {
    throw new DocumentoFinanceiroErro('Endereço de download inválido', 502)
  }
  const download = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (download?.status === 404 || download?.status === 410) return null
  if (!download?.ok) throw erroGraph(download?.status ?? 502)
  return download.body
}

export async function lerBytesFinanceiros(stream: ReadableStream<Uint8Array>, limite: number) {
  const reader = stream.getReader()
  const partes: Buffer[] = []
  let tamanho = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(partes, tamanho)
      tamanho += value.length
      if (tamanho > limite) {
        await reader.cancel().catch(() => undefined)
        throw new DocumentoFinanceiroErro('Arquivo acima do limite desta operação', 413)
      }
      partes.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
}

export function arquivosOneDrive(ator: Ator): ArquivosFinanceiros {
  return {
    async salvar({ tenantId, caminho, mimeType, bytes, sha256: hash }) {
      if (ator.tenantId !== tenantId) throw new DocumentoFinanceiroErro('Documento não encontrado', 404)
      const op = await autorizacaoGraph(ator, exigirOneDrive())
      const partes = caminho.split('/').map(decodeURIComponent)
      const nome = partes.pop()!
      let pasta = op.pastaId
      for (const parte of partes) pasta = await garantirPasta(op, pasta, parte)
      const path = localizar(op, pasta) + ':/' + segmento(nome)
      const resposta = await grafico(op.acesso, path + ':/content?%40microsoft.graph.conflictBehavior=fail', {
        method: 'PUT', headers: { 'Content-Type': mimeType, 'If-None-Match': '*' },
        body: new Uint8Array(bytes),
      })
      if (resposta.status === 409 || resposta.status === 412) {
        const existente = await obterItem(await grafico(op.acesso, path))
        const original = existente.file ? await lerConteudo(op, existente.id) : null
        if (!original || sha256(await lerBytesFinanceiros(original, bytes.length)) !== hash) {
          throw new DocumentoFinanceiroErro('Identificador de envio já utilizado', 409)
        }
        return { driveId: op.driveId, driveItemId: existente.id }
      }
      const item = await obterItem(resposta)
      if (!item.file || (item.parentReference?.driveId && item.parentReference.driveId !== op.driveId)) {
        throw new DocumentoFinanceiroErro('Original indisponível no OneDrive', 502)
      }
      return { driveId: op.driveId, driveItemId: item.id }
    },
    async abrir(tenantId, arquivo) {
      if (ator.tenantId !== tenantId) return null
      const op = await autorizacaoGraph(ator, exigirOneDrive())
      if (arquivo.driveId !== op.driveId) return null
      return lerConteudo(op, arquivo.driveItemId)
    },
  }
}
