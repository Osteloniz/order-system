import { Prisma, type AcaoDocumentoFinanceiro } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  dataFiscalValida, DocumentoFinanceiroErro, leituraSchema, MAX_VALOR_CENTAVOS,
  normalizarCnpj, normalizarNomeFinanceiro, validarArquivoFinanceiro, type LeituraFinanceira,
} from '@/lib/documento-financeiro-arquivo'

type Ator = { tenantId: string; adminUserId: string }
type ReferenciaArquivo = { driveId: string; driveItemId: string }

// Implementação de produção pendente da conexão delegada Microsoft.
export interface ArquivosFinanceiros {
  salvar(input: {
    tenantId: string; caminho: string; mimeType: string; bytes: Buffer; sha256: string
  }): Promise<ReferenciaArquivo>
  abrir(tenantId: string, arquivo: ReferenciaArquivo): Promise<ReadableStream<Uint8Array> | null>
}

type OcrFinanceiro = (input: { mimeType: string; bytes: Buffer }) => Promise<unknown>

const fornecedorSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('SEM_FORNECEDOR') }).strict(),
  z.object({ tipo: z.literal('EXISTENTE'), id: z.string().uuid() }).strict(),
  z.object({
    tipo: z.literal('CADASTRAR'),
    nome: z.string().trim().min(2).max(80),
    razaoSocial: z.string().trim().min(2).max(160).optional(),
    cnpj: z.string().max(32).transform(normalizarCnpj).pipe(z.string()).optional(),
  }).strict(),
])
const revisaoSchema = z.object({
  descricao: z.string().trim().max(120).optional(),
  valor: z.number().int().positive().max(MAX_VALOR_CENTAVOS).optional(),
  vencimento: z.string().refine(dataFiscalValida).optional(),
  fornecedor: fornecedorSchema.optional(),
  categoriaFinanceiraId: z.string().uuid().optional(),
  observacoes: z.string().trim().max(1000).optional(),
}).strict()
const revisaoCompletaSchema = revisaoSchema.extend({
  descricao: z.string().trim().min(2).max(120),
  valor: z.number().int().positive().max(MAX_VALOR_CENTAVOS),
  vencimento: z.string().refine(dataFiscalValida),
  fornecedor: fornecedorSchema,
})
const versaoSchema = z.number().int().min(0).max(2_147_483_646)
const motivoSchema = z.string().trim().min(5).max(300)
export const salvarRevisaoSchema = z.object({ versao: versaoSchema, revisao: revisaoSchema }).strict()
export const confirmarDocumentoSchema = z.object({
  versao: versaoSchema,
  duplicidade: z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('USAR_EXISTENTE'), contaPagarId: z.string().uuid() }).strict(),
    z.object({ tipo: z.literal('MANTER_NOVO'), motivo: motivoSchema }).strict(),
  ]).optional(),
}).strict()
export const cancelarDocumentoSchema = z.object({ versao: versaoSchema, motivo: motivoSchema }).strict()

const selecaoDocumento = {
  id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true, status: true,
  origemLeitura: true, dadosExtraidos: true, revisao: true, versao: true,
  contaPagarId: true, criadoEm: true, atualizadoEm: true,
} satisfies Prisma.DocumentoFinanceiroSelect

function json(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function unico(erro: unknown) {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

function auditar(
  tx: Prisma.TransactionClient, ator: Ator, documentoId: string, acao: AcaoDocumentoFinanceiro,
  detalhes: { contaPagarId?: string; motivo?: string } = {},
) {
  return tx.documentoFinanceiroEvento.create({
    data: { tenantId: ator.tenantId, atorId: ator.adminUserId, documentoId, acao, ...detalhes },
  })
}

async function obter(tx: Prisma.TransactionClient, ator: Ator, id: string) {
  const documento = await tx.documentoFinanceiro.findUnique({
    where: { tenantId_id: { tenantId: ator.tenantId, id } },
  })
  if (!documento) throw new DocumentoFinanceiroErro('Documento não encontrado', 404)
  return documento
}

async function travarTenant(tx: Prisma.TransactionClient, ator: Ator) {
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${ator.tenantId} FOR NO KEY UPDATE`
}

function conferirRevisao(documento: { status: string; versao: number }, versao: number) {
  if (!['PRONTO_PARA_REVISAO', 'FALHA_LEITURA'].includes(documento.status) || documento.versao !== versao) {
    throw new DocumentoFinanceiroErro('O documento foi alterado. Atualize antes de continuar', 409)
  }
}

export async function capturarDocumento(
  ator: Ator, upload: { id: string; nome: string; mime: string; bytes: Buffer },
  arquivos: ArquivosFinanceiros, ocr?: OcrFinanceiro,
) {
  const id = z.string().uuid().parse(upload.id)
  const arquivo = validarArquivoFinanceiro(upload.nome, upload.mime, upload.bytes)
  const where = { tenantId_id: { tenantId: ator.tenantId, id } }
  const anterior = await prisma.documentoFinanceiro.findUnique({
    where, select: { ...selecaoDocumento, sha256: true, enviadoPorId: true },
  })
  if (anterior) {
    const { sha256, enviadoPorId, ...documento } = anterior
    if (sha256 !== arquivo.sha256 || enviadoPorId !== ator.adminUserId) {
      throw new DocumentoFinanceiroErro('Identificador de envio já utilizado', 409)
    }
    return documento
  }

  const partesData = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo',
  }).formatToParts()
  const ano = partesData.find(({ type }) => type === 'year')!.value
  const mes = partesData.find(({ type }) => type === 'month')!.value
  const caminho = ['Notas', encodeURIComponent(ator.tenantId), ano, mes, id + '.' + arquivo.extensao].join('/')
  const referencia = await arquivos.salvar({
    tenantId: ator.tenantId, caminho, mimeType: arquivo.mimeType, bytes: upload.bytes, sha256: arquivo.sha256,
  })
  const origemLeitura = arquivo.extensao === 'xml' ? 'XML' : 'OCR'
  let leitura = arquivo.xml
  if (origemLeitura === 'OCR' && ocr) {
    try {
      const resultado = leituraSchema.safeParse(await ocr({ mimeType: arquivo.mimeType, bytes: upload.bytes }))
      if (resultado.success && Object.values(resultado.data.campos).some((valor) => valor !== undefined)) {
        leitura = {
          campos: resultado.data.campos,
          confianca: Object.fromEntries(Object.keys(resultado.data.campos).map((campo) => [campo, 'BAIXA'])),
        } satisfies LeituraFinanceira
      }
    } catch {
      // A leitura pode falhar após o original já estar no armazenamento.
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const campos = leitura?.campos
      const documento = await tx.documentoFinanceiro.create({
        data: {
          id, tenantId: ator.tenantId, driveId: referencia.driveId, driveItemId: referencia.driveItemId,
          nomeOriginal: arquivo.nomeOriginal, mimeType: arquivo.mimeType,
          sha256: arquivo.sha256, tamanhoBytes: arquivo.tamanhoBytes, enviadoPorId: ator.adminUserId,
          origemLeitura, status: leitura ? 'PRONTO_PARA_REVISAO' : 'FALHA_LEITURA',
          dadosExtraidos: leitura ? json(leitura) : undefined, extraidoEm: leitura ? new Date() : undefined,
          cnpjEmissor: campos?.cnpj, chaveAcesso: campos?.chave, numeroDocumento: campos?.numero,
          serie: campos?.serie, dataEmissao: campos?.emissao ? new Date(campos.emissao) : undefined,
          valorTotalExtraido: campos?.valor,
        },
        select: selecaoDocumento,
      })
      await auditar(tx, ator, id, 'ENVIO')
      await auditar(tx, ator, id, leitura ? 'LEITURA' : 'FALHA_LEITURA')
      return documento
    })
  } catch (erro) {
    if (!unico(erro)) throw erro
    const repetido = await prisma.documentoFinanceiro.findFirst({
      where: { id, tenantId: ator.tenantId, sha256: arquivo.sha256, enviadoPorId: ator.adminUserId },
      select: selecaoDocumento,
    })
    if (repetido) return repetido
    throw new DocumentoFinanceiroErro('Identificador de envio já utilizado', 409)
  }
}

export async function consultarDocumento(ator: Ator, id: string) {
  const documento = await prisma.documentoFinanceiro.findUnique({
    where: { tenantId_id: { tenantId: ator.tenantId, id } },
    select: { ...selecaoDocumento, cnpjEmissor: true },
  })
  if (!documento) throw new DocumentoFinanceiroErro('Documento não encontrado', 404)
  const leitura = leituraSchema.safeParse(documento.dadosExtraidos)
  const nomeFiscal = leitura.success ? leitura.data.campos.emissor : undefined
  const nomeNormalizado = nomeFiscal ? normalizarNomeFinanceiro(nomeFiscal) : ''
  const candidatos = (documento.cnpjEmissor || nomeNormalizado) ? await prisma.fornecedorFinanceiro.findMany({
    where: {
      tenantId: ator.tenantId,
      OR: [
        ...(documento.cnpjEmissor ? [{ cnpjNormalizado: documento.cnpjEmissor }] : []),
        ...(nomeNormalizado ? [{ nomeNormalizado }, { nomeNormalizado: null }] : []),
      ],
    },
    select: { id: true, nome: true, razaoSocial: true, cnpjNormalizado: true },
    orderBy: { nome: 'asc' },
  }) : []
  const fornecedorPorCnpj = candidatos.find((f) => documento.cnpjEmissor && f.cnpjNormalizado === documento.cnpjEmissor)
  return {
    ...documento,
    fornecedorPorCnpj: fornecedorPorCnpj ?? null,
    nomeFiscalDivergente: Boolean(fornecedorPorCnpj && nomeNormalizado &&
      normalizarNomeFinanceiro(fornecedorPorCnpj.razaoSocial ?? fornecedorPorCnpj.nome) !== nomeNormalizado),
    fornecedoresPorNome: nomeNormalizado ? candidatos.filter((f) => f.id !== fornecedorPorCnpj?.id &&
      [f.nome, f.razaoSocial].some((nome) => nome && normalizarNomeFinanceiro(nome) === nomeNormalizado)).slice(0, 10) : [],
  }
}

export function listarDocumentos(ator: Ator) {
  return prisma.documentoFinanceiro.findMany({
    where: { tenantId: ator.tenantId },
    orderBy: { criadoEm: 'desc' },
    take: 40,
    select: { id: true, nomeOriginal: true, status: true, criadoEm: true, contaPagarId: true },
  })
}

export async function salvarRevisaoDocumento(ator: Ator, id: string, body: z.output<typeof salvarRevisaoSchema>) {
  return prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator)
    const documento = await obter(tx, ator, id)
    conferirRevisao(documento, body.versao)
    const atualizado = await tx.documentoFinanceiro.update({
      where: { id }, data: { revisao: json(body.revisao), versao: { increment: 1 } }, select: selecaoDocumento,
    })
    await auditar(tx, ator, id, 'REVISAO')
    return atualizado
  })
}

export async function cancelarDocumento(ator: Ator, id: string, body: z.output<typeof cancelarDocumentoSchema>) {
  return prisma.$transaction(async (tx) => {
    await travarTenant(tx, ator)
    const documento = await obter(tx, ator, id)
    conferirRevisao(documento, body.versao)
    const atualizado = await tx.documentoFinanceiro.update({
      where: { id }, data: {
        status: 'CANCELADO', canceladoPorId: ator.adminUserId, canceladoEm: new Date(), versao: { increment: 1 },
      }, select: selecaoDocumento,
    })
    await auditar(tx, ator, id, 'CANCELAMENTO', { motivo: body.motivo })
    return atualizado
  })
}

async function encontrarDuplicidades(
  tx: Prisma.TransactionClient, documento: Awaited<ReturnType<typeof obter>>,
) {
  const { tenantId, sha256, chaveAcesso, cnpjEmissor, numeroDocumento, serie, valorTotalExtraido, dataEmissao } = documento
  const filtros: Prisma.DocumentoFinanceiroWhereInput[] = [{ sha256 }]
  if (chaveAcesso) filtros.push({ chaveAcesso })
  if (cnpjEmissor && numeroDocumento && serie && !chaveAcesso) filtros.push({ cnpjEmissor, numeroDocumento, serie })
  if (cnpjEmissor && numeroDocumento && serie && chaveAcesso) {
    filtros.push({ chaveAcesso: null, cnpjEmissor, numeroDocumento, serie })
  }
  if (valorTotalExtraido && dataEmissao) filtros.push({ valorTotalExtraido, dataEmissao })
  const encontrados = await tx.documentoFinanceiro.findMany({
    where: { tenantId, id: { not: documento.id }, status: 'CONFIRMADO', OR: filtros },
    select: {
      sha256: true, chaveAcesso: true, cnpjEmissor: true, numeroDocumento: true, serie: true,
      valorTotalExtraido: true, dataEmissao: true,
      contaPagar: { select: { id: true, descricao: true, valor: true, vencimento: true, status: true } },
    },
    orderBy: { confirmadoEm: 'desc' },
  })
  const contas = new Map<string, { conta: NonNullable<(typeof encontrados)[number]['contaPagar']>; sinais: Set<string> }>()
  for (const encontrado of encontrados) {
    if (!encontrado.contaPagar) continue
    const conta = contas.get(encontrado.contaPagar.id) ?? { conta: encontrado.contaPagar, sinais: new Set<string>() }
    if (encontrado.sha256 === sha256) conta.sinais.add('MESMO_ARQUIVO')
    if (chaveAcesso && encontrado.chaveAcesso === chaveAcesso) conta.sinais.add('CHAVE_FISCAL')
    if (cnpjEmissor && numeroDocumento && serie && encontrado.cnpjEmissor === cnpjEmissor &&
        encontrado.numeroDocumento === numeroDocumento && encontrado.serie === serie &&
        (!chaveAcesso || !encontrado.chaveAcesso)) conta.sinais.add('CNPJ_NUMERO_SERIE')
    if (valorTotalExtraido && dataEmissao && encontrado.valorTotalExtraido === valorTotalExtraido &&
        encontrado.dataEmissao?.getTime() === dataEmissao.getTime()) conta.sinais.add('VALOR_EMISSAO')
    contas.set(encontrado.contaPagar.id, conta)
  }
  return Array.from(contas.values(), ({ conta, sinais }) => ({ ...conta, sinais: Array.from(sinais) }))
}

async function resolverFornecedor(
  tx: Prisma.TransactionClient, tenantId: string, escolha: z.output<typeof fornecedorSchema>,
) {
  if (escolha.tipo === 'SEM_FORNECEDOR') return null
  if (escolha.tipo === 'EXISTENTE') {
    const fornecedor = await tx.fornecedorFinanceiro.findFirst({ where: { tenantId, id: escolha.id } })
    if (!fornecedor) throw new DocumentoFinanceiroErro('Fornecedor inválido', 400)
    return fornecedor
  }
  const mesmoNome = await tx.fornecedorFinanceiro.findFirst({
    where: { tenantId, nome: { equals: escolha.nome, mode: 'insensitive' } }, select: { id: true },
  })
  if (mesmoNome) throw new DocumentoFinanceiroErro('Fornecedor já cadastrado. Selecione o cadastro existente', 409)
  return tx.fornecedorFinanceiro.create({
    data: {
      tenantId, nome: escolha.nome, razaoSocial: escolha.razaoSocial,
      nomeNormalizado: normalizarNomeFinanceiro(escolha.nome), cnpjNormalizado: escolha.cnpj,
    },
  })
}

export async function confirmarDocumento(ator: Ator, id: string, body: z.output<typeof confirmarDocumentoSchema>) {
  try {
    return await prisma.$transaction(async (tx) => {
      await travarTenant(tx, ator)
      const documento = await obter(tx, ator, id)
      if (documento.status === 'CONFIRMADO' && documento.contaPagarId) {
        return { contaPagarId: documento.contaPagarId, repetido: true }
      }
      conferirRevisao(documento, body.versao)
      const revisao = revisaoCompletaSchema.safeParse(documento.revisao)
      if (!revisao.success) throw new DocumentoFinanceiroErro('Revise descrição, valor, vencimento e fornecedor', 400)
      const duplicidades = await encontrarDuplicidades(tx, documento)
      let contaPagarId: string | undefined
      if (duplicidades.length) {
        const decisao = body.duplicidade
        if (decisao?.tipo === 'USAR_EXISTENTE') {
          contaPagarId = duplicidades.find((conta) => conta.id === decisao.contaPagarId)?.id
        }
        await auditar(tx, ator, id, 'DUPLICIDADE', {
          contaPagarId, motivo: decisao?.tipo === 'MANTER_NOVO' ? decisao.motivo : undefined,
        })
        if (!contaPagarId && decisao?.tipo !== 'MANTER_NOVO') return { duplicidades }
      } else if (body.duplicidade) {
        throw new DocumentoFinanceiroErro('As duplicidades mudaram. Atualize a conferência', 409)
      }

      if (!contaPagarId) {
        const { descricao, valor, vencimento, fornecedor, categoriaFinanceiraId, observacoes } = revisao.data
        const categoria = categoriaFinanceiraId ? await tx.categoriaFinanceira.findFirst({
          where: { tenantId: ator.tenantId, id: categoriaFinanceiraId, escopo: { in: ['PAGAR', 'AMBOS'] } },
        }) : null
        if (categoriaFinanceiraId && !categoria) throw new DocumentoFinanceiroErro('Categoria inválida', 400)
        const cadastro = await resolverFornecedor(tx, ator.tenantId, fornecedor)
        const conta = await tx.contaPagar.create({
          data: {
            tenantId: ator.tenantId, descricao, valor, vencimento: new Date(vencimento + 'T00:00:00-03:00'),
            status: 'PENDENTE', categoriaFinanceiraId: categoria?.id, categoria: categoria?.nome,
            fornecedorFinanceiroId: cadastro?.id, fornecedor: cadastro?.nome, observacoes,
          },
          select: { id: true },
        })
        contaPagarId = conta.id
      }

      await tx.documentoFinanceiro.update({
        where: { id }, data: {
          contaPagarId, status: 'CONFIRMADO', confirmadoPorId: ator.adminUserId,
          confirmadoEm: new Date(), versao: { increment: 1 },
        },
      })
      await auditar(tx, ator, id, 'CONFIRMACAO', { contaPagarId })
      return { contaPagarId, repetido: false }
    })
  } catch (erro) {
    if (unico(erro)) throw new DocumentoFinanceiroErro('Fornecedor já cadastrado. Selecione o cadastro existente', 409)
    throw erro
  }
}

export async function abrirDocumento(ator: Ator, id: string, arquivos: ArquivosFinanceiros) {
  const documento = await obter(prisma, ator, id)
  await auditar(prisma, ator, id, 'ACESSO_ANEXO')
  const stream = await arquivos.abrir(ator.tenantId, {
    driveId: documento.driveId, driveItemId: documento.driveItemId,
  })
  if (!stream) throw new DocumentoFinanceiroErro('Anexo indisponível no OneDrive', 404)
  return {
    stream, mimeType: documento.mimeType, nomeOriginal: documento.nomeOriginal,
    sha256: documento.sha256, tamanhoBytes: documento.tamanhoBytes,
  }
}
