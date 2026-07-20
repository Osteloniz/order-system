import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error'
import { prisma } from '@/lib/db'
import { resolveStoreHoursStatus } from '@/lib/store-hours'

export const runtime = 'nodejs'

// GET /api/tenants - retorna apenas Brookie Pregiato (single-tenant)
export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { slug: 'brookie-pregiato' },
      select: {
        id: true,
        nome: true,
        slug: true,
        isOpen: true,
        configuracao: {
          select: {
            checkoutPublicoHorarioAtivo: true,
            checkoutPublicoHorarioAbertura: true,
            checkoutPublicoHorarioFechamento: true,
          },
        },
      }
    })
    return NextResponse.json(
      tenants.map((tenant) => {
        const lojaStatus = resolveStoreHoursStatus({
          manualIsOpen: tenant.isOpen,
          scheduleEnabled: tenant.configuracao?.checkoutPublicoHorarioAtivo,
          openTime: tenant.configuracao?.checkoutPublicoHorarioAbertura,
          closeTime: tenant.configuracao?.checkoutPublicoHorarioFechamento,
        })

        return {
          id: tenant.id,
          nome: tenant.nome,
          slug: tenant.slug,
          isOpen: lojaStatus.isOpen,
          lojaStatus,
        }
      }),
    )
  } catch (error) {
    return handleApiError('api/tenants GET', error, 'Erro ao carregar dados do tenant')
  }
}
