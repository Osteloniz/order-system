import { ConfirmationPage } from '@/components/checkout/confirmation-page'

export default async function Confirmacao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string; sync?: string }>
}) {
  const { id } = await params
  const { token, sync } = await searchParams
  return <ConfirmationPage pedidoId={id} accessToken={token} paymentSyncPending={sync === 'pending'} />
}
