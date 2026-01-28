import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

// GET /api/admin/tenant - dados basicos da empresa
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: { id: true, nome: true, slug: true, isOpen: true }
  })

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nao encontrado' }, { status: 404 })
  }

  return NextResponse.json(tenant)
}

// PUT /api/admin/tenant - atualiza status aberto/fechado
export async function PUT(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const isOpen = Boolean(body.isOpen)

  const tenant = await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: { isOpen }
  })

  return NextResponse.json(tenant)
}
