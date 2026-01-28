import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/tenants - lista empresas publicas
export async function GET() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, nome: true, slug: true, isOpen: true },
    orderBy: { nome: 'asc' }
  })
  return NextResponse.json(tenants)
}
