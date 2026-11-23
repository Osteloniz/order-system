import { createHash } from 'node:crypto'
import { SaxesParser } from 'saxes'
import { z } from 'zod'

export const LIMITE_DOCUMENTO_BYTES = 15 * 1024 * 1024
export const MAX_VALOR_CENTAVOS = 2_147_483_647

export class DocumentoFinanceiroErro extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function normalizarCnpj(value: string) {
  const cnpj = value.replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return null
  for (const length of [12, 13]) {
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * ((length - 1 - i) % 8 + 2)
    }
    const remainder = sum % 11
    if (Number(cnpj[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return null
  }
  return cnpj
}

export function normalizarNomeFinanceiro(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\bs\s*\/\s*a\b/g, ' sa ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/(?:\s+(?:ltda|eireli|epp|me|sa))+$/, '')
}

export function dataFiscalValida(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const itemSchema = z.object({
  descricao: z.string().trim().min(1).max(160),
  quantidade: z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/).optional(),
  valor: z.number().int().nonnegative().max(MAX_VALOR_CENTAVOS).optional(),
}).strict()

export const extracaoSchema = z.object({
  emissor: z.string().trim().min(1).max(160).optional(),
  cnpj: z.string().max(32).transform(normalizarCnpj).pipe(z.string()).optional(),
  chave: z.string().regex(/^\d{44}$/).optional(),
  numero: z.string().regex(/^\d{1,12}$/).transform(Number).transform(String).optional(),
  serie: z.string().regex(/^\d{1,6}$/).transform(Number).transform(String).optional(),
  emissao: z.string().refine(dataFiscalValida).optional(),
  vencimento: z.string().refine(dataFiscalValida).optional(),
  valor: z.number().int().positive().max(MAX_VALOR_CENTAVOS).optional(),
  descricao: z.string().trim().min(1).max(120).optional(),
  itens: z.array(itemSchema).max(50).optional(),
}).strict()

const confianca = z.enum(['ALTA', 'BAIXA'])
export const leituraSchema = z.object({
  campos: extracaoSchema,
  confianca: z.object({
    emissor: confianca.optional(),
    cnpj: confianca.optional(),
    chave: confianca.optional(),
    numero: confianca.optional(),
    serie: confianca.optional(),
    emissao: confianca.optional(),
    vencimento: confianca.optional(),
    valor: confianca.optional(),
    descricao: confianca.optional(),
    itens: confianca.optional(),
  }).strict(),
}).strict()

export type LeituraFinanceira = z.output<typeof leituraSchema>

const nfeNamespace = 'http://www.portalfiscal.inf.br/nfe'
const paths = {
  'emit/xNome': 'emissor',
  'emit/CNPJ': 'cnpj',
  'ide/nNF': 'numero',
  'ide/serie': 'serie',
  'ide/dhEmi': 'emissao',
  'ide/dEmi': 'emissao',
  'total/ICMSTot/vNF': 'valor',
  'cobr/dup/dVenc': 'vencimento',
} as const

function centavos(value?: string) {
  if (!value || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return undefined
  const [inteiro, fracao = ''] = value.split('.')
  const total = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'))
  return total <= MAX_VALOR_CENTAVOS ? total : undefined
}

function xmlInvalido(): never {
  throw new DocumentoFinanceiroErro('XML inválido ou com estrutura não permitida', 415)
}

function lerXml(bytes: Uint8Array): LeituraFinanceira | null {
  const parser = new SaxesParser({ xmlns: true })
  const stack: string[] = []
  const values: Record<string, string> = {}
  const itens: z.output<typeof itemSchema>[] = []
  let item: Record<string, string> = {}
  let nfePath = ''
  let text = ''
  let parcelas = 0
  parser.on('doctype', xmlInvalido)
  parser.on('error', xmlInvalido)
  parser.on('opentag', (tag) => {
    if (stack.length >= 32) xmlInvalido()
    if (stack.length === 0 && (tag.uri !== nfeNamespace || !['NFe', 'nfeProc'].includes(tag.local))) {
      xmlInvalido()
    }
    stack.push(tag.uri === nfeNamespace ? tag.local : '')
    text = ''
    const path = stack.join('/')
    if (path === 'NFe/infNFe' || path === 'nfeProc/NFe/infNFe') {
      if (nfePath) xmlInvalido()
      nfePath = path + '/'
      const key = tag.attributes.Id?.value.match(/^NFe(\d{44})$/)?.[1]
      if (key) values.chave = key
    }
    if (nfePath && path === nfePath + 'cobr/dup') parcelas++
    if (nfePath && path === nfePath + 'det') item = {}
  })
  const collect = (part: string) => { text = (text + part.slice(0, 512)).slice(0, 512) }
  parser.on('text', collect)
  parser.on('cdata', collect)
  parser.on('closetag', () => {
    const path = stack.join('/')
    if (nfePath && path.startsWith(nfePath)) {
      const relative = path.slice(nfePath.length)
      const field = paths[relative as keyof typeof paths]
      if (field) values[field] = text.trim()
      if (/^det\/prod\/(xProd|qCom|vProd)$/.test(relative)) item[stack.at(-1)!] = text.trim()
      if (relative === 'det' && itens.length < 50) {
        const parsed = itemSchema.safeParse({
          descricao: item.xProd?.slice(0, 160), quantidade: item.qCom, valor: centavos(item.vProd),
        })
        if (parsed.success) itens.push(parsed.data)
      }
    }
    stack.pop()
    text = ''
  })
  let xml: string
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return xmlInvalido()
  }
  parser.write(xml).close()
  if (!nfePath) return xmlInvalido()
  const emissao = values.emissao?.slice(0, 10)
  const campos = extracaoSchema.parse({
    emissor: values.emissor?.slice(0, 160) || undefined,
    cnpj: values.cnpj ? normalizarCnpj(values.cnpj) || undefined : undefined,
    chave: values.chave,
    numero: /^\d{1,12}$/.test(values.numero) ? values.numero : undefined,
    serie: /^\d{1,6}$/.test(values.serie) ? values.serie : undefined,
    emissao: emissao && dataFiscalValida(emissao) ? emissao : undefined,
    vencimento: parcelas === 1 && dataFiscalValida(values.vencimento) ? values.vencimento : undefined,
    valor: centavos(values.valor) || undefined,
    descricao: values.numero && /^\d{1,12}$/.test(values.numero) ? 'NF-e ' + values.numero : undefined,
    itens: itens.length ? itens : undefined,
  })
  const confianca = Object.fromEntries(
    Object.entries(campos).filter(([, value]) => value !== undefined)
      .map(([key]) => [key, key === 'descricao' ? 'BAIXA' : 'ALTA']),
  )
  return Object.values(campos).some((value) => value !== undefined)
    ? leituraSchema.parse({ campos, confianca }) : null
}

const tipos = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  xml: 'application/xml',
} as const

export function validarArquivoFinanceiro(nome: string, mimeDeclarado: string, bytes: Buffer) {
  if (bytes.length > LIMITE_DOCUMENTO_BYTES) throw new DocumentoFinanceiroErro('Arquivo acima de 15 MB', 413)
  const nomeOriginal = nome.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, '') ?? ''
  if (!nomeOriginal || nomeOriginal.length > 255 || bytes.length === 0) {
    throw new DocumentoFinanceiroErro('Arquivo inválido', 415)
  }
  const rawExt = nomeOriginal.split('.').pop()?.toLowerCase()
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
  if (!ext || !Object.hasOwn(tipos, ext) || !nomeOriginal.includes('.')) {
    throw new DocumentoFinanceiroErro('Formato de arquivo não permitido', 415)
  }
  const extensao = ext as keyof typeof tipos
  const mimeType = tipos[extensao]
  if (mimeDeclarado && mimeDeclarado !== mimeType && !(extensao === 'xml' && mimeDeclarado === 'text/xml')) {
    throw new DocumentoFinanceiroErro('O tipo informado diverge do formato do arquivo', 415)
  }
  const assinatura = bytes.subarray(0, 8).toString('hex')
  const valido = {
    jpg: bytes.length > 8 && assinatura.startsWith('ffd8ff') && bytes.subarray(-2).toString('hex') === 'ffd9',
    png: assinatura === '89504e470d0a1a0a' && bytes.length >= 45 &&
      bytes.readUInt32BE(8) === 13 && bytes.toString('latin1', 12, 16) === 'IHDR' &&
      bytes.subarray(-12).toString('hex') === '0000000049454e44ae426082',
    webp: bytes.length > 20 && bytes.toString('latin1', 0, 4) === 'RIFF' &&
      bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString('latin1', 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('latin1', 12, 16)),
    pdf: /^%PDF-\d\.\d[\r\n]/.test(bytes.toString('latin1', 0, 9)) &&
      /%%EOF[\t\n\r ]*$/.test(bytes.subarray(-1024).toString('latin1')),
    xml: /^\s*</.test(bytes.subarray(0, 256).toString('utf8')),
  }[extensao]
  if (!valido) throw new DocumentoFinanceiroErro('O conteúdo diverge do formato do arquivo', 415)
  return {
    nomeOriginal, extensao, mimeType, tamanhoBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    xml: extensao === 'xml' ? lerXml(bytes) : null,
  }
}
