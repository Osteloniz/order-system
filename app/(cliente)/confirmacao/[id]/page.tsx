import { ConfirmationPage } from '@/components/checkout/confirmation-page'

export default async function Confirmacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ConfirmationPage pedidoId={id} />
}
