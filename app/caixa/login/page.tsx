import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CaixaLogin } from '@/components/admin/caixa-login'
import { getCaixaActor } from '@/lib/caixa-session'
import { CAIXA_COOKIE } from '@/lib/caixa-session-policy'
import { prisma } from '@/lib/db'

export default async function CaixaLoginPage() {
  const jar = await cookies()
  if (jar.has(CAIXA_COOKIE) && (await getCaixaActor())?.role === 'CAIXA') redirect('/caixa')

  const lojas = await prisma.tenant.findMany({
    where: { slug: 'brookie-pregiato' },
    select: { nome: true, slug: true },
  })
  return <Suspense><CaixaLogin lojas={lojas} /></Suspense>
}
