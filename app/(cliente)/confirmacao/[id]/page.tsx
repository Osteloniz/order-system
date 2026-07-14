import { ConfirmationPage } from '@/components/checkout/confirmation-page'

export default async function Confirmacao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams
  return <ConfirmationPage pedidoId={id} accessToken={token} />
}
