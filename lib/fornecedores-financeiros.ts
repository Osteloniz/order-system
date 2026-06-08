import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type FornecedorFinanceiroOption = {
  id: string
  nome: string
  legacy?: boolean
}

type ResolveFornecedorFinanceiroInput = {
  tenantId: string
  fornecedorFinanceiroId?: string | null
  fornecedor?: string | null
}

const LEGACY_ID_PREFIX = 'legacy:'

function normalizeFornecedorNome(value?: string | null) {
  return value?.trim() || null
}

function makeLegacyFornecedorId(nome: string) {
  return `${LEGACY_ID_PREFIX}${nome}`
}

function extractLegacyFornecedorNome(id?: string | null) {
  if (!id?.startsWith(LEGACY_ID_PREFIX)) return null
  return normalizeFornecedorNome(id.slice(LEGACY_ID_PREFIX.length))
}

function isMissingFornecedorFinanceiroSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  )
}

export async function hasFornecedorFinanceiroSchema() {
  try {
    await prisma.fornecedorFinanceiro.findFirst({
      select: { id: true },
    })
    return true
  } catch (error) {
    if (isMissingFornecedorFinanceiroSchemaError(error)) {
      return false
    }
    throw error
  }
}

export async function listFornecedoresFinanceiros(tenantId: string): Promise<FornecedorFinanceiroOption[]> {
  const hasStructuredSchema = await hasFornecedorFinanceiroSchema()

  if (hasStructuredSchema) {
    const fornecedores = await prisma.fornecedorFinanceiro.findMany({
      where: { tenantId },
      orderBy: [{ nome: 'asc' }],
    })

    return fornecedores.map((fornecedor) => ({
      id: fornecedor.id,
      nome: fornecedor.nome,
      legacy: false,
    }))
  }

  const contas = await prisma.contaPagar.findMany({
    where: {
      tenantId,
      fornecedor: {
        not: null,
      },
    },
    select: {
      fornecedor: true,
    },
  })

  const nomes = Array.from(
    new Set(
      contas
        .map((conta) => normalizeFornecedorNome(conta.fornecedor))
        .filter((nome): nome is string => Boolean(nome))
        .map((nome) => nome.toLocaleLowerCase('pt-BR'))
    )
  )

  const originalNames = new Map<string, string>()
  for (const conta of contas) {
    const nome = normalizeFornecedorNome(conta.fornecedor)
    if (!nome) continue
    const key = nome.toLocaleLowerCase('pt-BR')
    if (!originalNames.has(key)) originalNames.set(key, nome)
  }

  return nomes
    .map((key) => {
      const nome = originalNames.get(key) || key
      return {
        id: makeLegacyFornecedorId(nome),
        nome,
        legacy: true,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

export async function resolveFornecedorFinanceiro(input: ResolveFornecedorFinanceiroInput) {
  const fornecedorFinanceiroId = input.fornecedorFinanceiroId?.trim() || null
  const fornecedorNomeInformado = normalizeFornecedorNome(input.fornecedor)
  const fornecedorLegacyId = extractLegacyFornecedorNome(fornecedorFinanceiroId)

  if (fornecedorLegacyId) {
    return {
      fornecedorFinanceiroId: null,
      fornecedor: fornecedorLegacyId,
      hasStructuredSchema: false,
    }
  }

  const hasStructuredSchema = await hasFornecedorFinanceiroSchema()

  if (!hasStructuredSchema) {
    return {
      fornecedorFinanceiroId: null,
      fornecedor: fornecedorNomeInformado,
      hasStructuredSchema: false,
    }
  }

  if (fornecedorFinanceiroId) {
    const fornecedor = await prisma.fornecedorFinanceiro.findFirst({
      where: {
        id: fornecedorFinanceiroId,
        tenantId: input.tenantId,
      },
    })

    if (!fornecedor) {
      return { error: 'Fornecedor invalido' as const }
    }

    return {
      fornecedorFinanceiroId: fornecedor.id,
      fornecedor: fornecedor.nome,
      hasStructuredSchema: true,
    }
  }

  if (!fornecedorNomeInformado) {
    return {
      fornecedorFinanceiroId: null,
      fornecedor: null,
      hasStructuredSchema: true,
    }
  }

  const fornecedorExistente = await prisma.fornecedorFinanceiro.findFirst({
    where: {
      tenantId: input.tenantId,
      nome: {
        equals: fornecedorNomeInformado,
        mode: 'insensitive',
      },
    },
  })

  if (fornecedorExistente) {
    return {
      fornecedorFinanceiroId: fornecedorExistente.id,
      fornecedor: fornecedorExistente.nome,
      hasStructuredSchema: true,
    }
  }

  const fornecedorCriado = await prisma.fornecedorFinanceiro.create({
    data: {
      tenantId: input.tenantId,
      nome: fornecedorNomeInformado,
    },
  })

  return {
    fornecedorFinanceiroId: fornecedorCriado.id,
    fornecedor: fornecedorCriado.nome,
    hasStructuredSchema: true,
  }
}
