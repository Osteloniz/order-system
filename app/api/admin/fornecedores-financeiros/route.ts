import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { hasFornecedorFinanceiroSchema, listFornecedoresFinanceiros } from '@/lib/fornecedores-financeiros'

export const runtime = 'nodejs'

const fornecedorFinanceiroSchema = z
  .object({
    nome: z.string().trim().min(2).max(80),
    cep: z.string().trim().max(9).optional(),
    endereco: z.string().trim().max(120).optional(),
    numero: z.string().trim().max(20).optional(),
    complemento: z.string().trim().max(80).optional(),
    estado: z.string().trim().max(2).optional(),
    cidade: z.string().trim().max(80).optional(),
    bairro: z.string().trim().max(80).optional(),
    telefone: z.string().trim().max(20).optional(),
    email: z.string().trim().email().max(120).optional(),
  })
  .strict()

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const fornecedores = await listFornecedoresFinanceiros(admin.tenantId)

    return NextResponse.json(fornecedores)
  } catch (error) {
    return handleApiError('api/admin/fornecedores-financeiros GET', error, 'Erro ao carregar fornecedores')
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const parsed = fornecedorFinanceiroSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
    }

    const fornecedoresExistentes = await listFornecedoresFinanceiros(admin.tenantId)
    const nomeNormalizado = parsed.data.nome.trim().toLocaleLowerCase('pt-BR')
    const duplicado = fornecedoresExistentes.find(
      (fornecedor) => fornecedor.nome.trim().toLocaleLowerCase('pt-BR') === nomeNormalizado
    )

    if (duplicado) {
      return NextResponse.json({ error: 'Fornecedor ja cadastrado' }, { status: 409 })
    }

    const optional = (value?: string) => value?.trim() || null
    if (!(await hasFornecedorFinanceiroSchema())) {
      return NextResponse.json({ error: 'Cadastro estruturado de fornecedores indisponivel' }, { status: 503 })
    }

    const fornecedor = await prisma.fornecedorFinanceiro.create({
      data: {
        tenantId: admin.tenantId,
        nome: parsed.data.nome.trim(),
        cep: optional(parsed.data.cep),
        endereco: optional(parsed.data.endereco),
        numero: optional(parsed.data.numero),
        complemento: optional(parsed.data.complemento),
        estado: optional(parsed.data.estado)?.toUpperCase() || null,
        cidade: optional(parsed.data.cidade),
        bairro: optional(parsed.data.bairro),
        telefone: optional(parsed.data.telefone),
        email: optional(parsed.data.email)?.toLowerCase() || null,
      },
    })

    return NextResponse.json(
      {
        id: fornecedor.id,
        nome: fornecedor.nome,
        cep: fornecedor.cep,
        endereco: fornecedor.endereco,
        numero: fornecedor.numero,
        complemento: fornecedor.complemento,
        estado: fornecedor.estado,
        cidade: fornecedor.cidade,
        bairro: fornecedor.bairro,
        telefone: fornecedor.telefone,
        email: fornecedor.email,
        legacy: false,
        duplicated: false,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError('api/admin/fornecedores-financeiros POST', error, 'Erro ao criar fornecedor')
  }
}
