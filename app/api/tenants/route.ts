import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/tenants - retorna apenas Brookie Pregiato (single-tenant)
export async function GET() {
  const tenants = await prisma.tenant.findMany({
    where: { slug: 'brookie-pregiato' },
    select: { id: true, nome: true, slug: true, isOpen: true }
  })
  return NextResponse.json(tenants)
}
