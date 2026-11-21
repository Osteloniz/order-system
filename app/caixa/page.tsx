import { redirect } from 'next/navigation'
import { getCaixaActor } from '@/lib/caixa-session'
import { prisma } from '@/lib/db'
import { CaixaWorkspace } from '@/components/admin/caixa-workspace'
import { Toaster } from '@/components/ui/sonner'
import { InternalTheme } from '@/components/admin/internal-theme'

export const dynamic = 'force-dynamic'

export default async function CaixaPage({ searchParams }: { searchParams: Promise<{ gestao?: string }> }) {
  const { gestao } = await searchParams
  const actor = await getCaixaActor()
  if (!actor) redirect('/caixa/login')
  const config = await prisma.configuracao.findUnique({
    where: { tenantId: actor.tenantId }, select: { temaVisual: true },
  })
  return (
    <>
      <Toaster position="top-right" closeButton />
      <InternalTheme current={config?.temaVisual ?? 'PADRAO'} />
      <CaixaWorkspace key={actor.tenantId + ':' + actor.id} conta={actor.tenantId + ':' + actor.id} operacional={actor.role === 'CAIXA'} initialNumber={gestao} />
    </>
  )
}
