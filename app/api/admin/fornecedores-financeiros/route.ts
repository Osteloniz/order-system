import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-error'
import { getAdminSession } from '@/lib/auth-helpers'
import { listFornecedoresFinanceiros, resolveFornecedorFinanceiro } from '@/lib/fornecedores-financeiros'

export const runtime = 'nodejs'

const fornecedorFinanceiroSchema = z
  .object({
    nome: z.string().trim().min(2).max(80),
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

    const fornecedor = await resolveFornecedorFinanceiro({
      tenantId: admin.tenantId,
      fornecedor: parsed.data.nome,
    })

    if ('error' in fornecedor) {
      return NextResponse.json({ error: fornecedor.error }, { status: 400 })
    }

    const nome = fornecedor.fornecedor ?? parsed.data.nome

    return NextResponse.json(
      {
        id: fornecedor.fornecedorFinanceiroId ?? `legacy:${fornecedor.fornecedor}`,
        nome,
        legacy: !fornecedor.hasStructuredSchema,
        duplicated: false,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError('api/admin/fornecedores-financeiros POST', error, 'Erro ao criar fornecedor')
  }
}
