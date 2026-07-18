'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Clock, Loader2, Phone, ReceiptText, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatarMoeda } from '@/lib/calc'
import {
  clearCustomerOrderLookupContact,
  getCustomerOrderLookupContact,
  getCustomerProfile,
  saveCustomerOrderLookupContact,
} from '@/lib/customer-session'
import { formatPhoneInput, isValidPhone, normalizePhone } from '@/lib/phone'
import { statusPagamentoLabelsLong, statusPedidoShortLabels } from '@/lib/order-display'
import type { PedidoPublicoResumo } from '@/lib/types'

type RecentOrdersResponse = {
  orders: PedidoPublicoResumo[]
}

const fetcher = async ([url, phone]: [string, string]) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefone: phone }),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel carregar seus pedidos agora.')
  }

  return data as RecentOrdersResponse
}

function RecentOrderCard({ pedido }: { pedido: PedidoPublicoResumo }) {
  return (
    <Link
      href={`/confirmacao/${pedido.id}`}
      className="block rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-secondary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Pedido #{pedido.id.slice(-8).toUpperCase()}</p>
          <p className="text-sm text-muted-foreground dark:text-white/80">{formatarMoeda(pedido.total)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline">{statusPedidoShortLabels[pedido.status]}</Badge>
          <span className="text-xs text-muted-foreground dark:text-white/80">
            {statusPagamentoLabelsLong[pedido.statusPagamento]}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function RecentOrders() {
  const [telefone, setTelefone] = useState('')
  const [submittedPhone, setSubmittedPhone] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const profile = getCustomerProfile()
    const initialContact =
      normalizePhone(profile?.whatsapp || profile?.telefone) ||
      getCustomerOrderLookupContact()

    if (!initialContact) return

    setTelefone(formatPhoneInput(initialContact))
    setSubmittedPhone(initialContact)
  }, [])

  const normalizedPhone = normalizePhone(telefone)
  const hasValidPhone = isValidPhone(normalizedPhone)
  const { data, error, isLoading, mutate } = useSWR<RecentOrdersResponse>(
    submittedPhone ? ['/api/pedidos/recentes', submittedPhone] : null,
    fetcher,
    {
      refreshInterval: submittedPhone ? 15000 : 0,
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    },
  )

  const orders = data?.orders ?? []

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')

    if (!hasValidPhone) {
      setFormError('Informe um telefone valido para localizar seus pedidos.')
      return
    }

    saveCustomerOrderLookupContact(normalizedPhone)
    setSubmittedPhone(normalizedPhone)
  }

  return (
    <section className="mx-auto max-w-2xl px-4 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Seus ultimos pedidos</h2>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground dark:text-white/80">
          <Clock className="h-3 w-3" />
          {submittedPhone ? 'neste telefone' : 'busca por telefone'}
        </div>
      </div>

      <form onSubmit={handleSearch} className="rounded-2xl border border-border/70 bg-card/95 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={telefone}
              onChange={(event) => setTelefone(formatPhoneInput(event.target.value))}
              placeholder="Digite seu telefone para acompanhar"
              className="h-11 pl-9"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <Button type="submit" className="h-11 rounded-2xl sm:min-w-[150px]" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar pedidos
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground dark:text-white/80">
          Use o mesmo numero do pedido. Por enquanto a recuperacao funciona pelo telefone cadastrado e depois vamos
          evoluir para uma confirmacao mais forte.
        </p>
        {formError ? <p className="mt-2 text-xs text-destructive">{formError}</p> : null}
        {error ? <p className="mt-2 text-xs text-destructive">{error.message}</p> : null}
      </form>

      {submittedPhone ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground dark:text-white/80">
            Consultando pedidos do numero {formatPhoneInput(submittedPhone)}.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground dark:text-white/80 dark:hover:text-white"
              onClick={async () => {
                await fetch('/api/pedidos/recentes', { method: 'DELETE' }).catch(() => null)
                clearCustomerOrderLookupContact()
                setTelefone('')
                setSubmittedPhone('')
                setFormError('')
              }}
            >
              Esquecer numero neste aparelho
            </Button>
          </div>
        </div>
      ) : null}

      {submittedPhone ? (
        orders.length > 0 ? (
          <div className="mt-3 space-y-2">
            {orders.map((pedido) => (
              <RecentOrderCard key={pedido.id} pedido={pedido} />
            ))}
          </div>
        ) : !isLoading && !error ? (
          <div className="mt-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground dark:text-white/80">
            Nao encontramos pedidos recentes para esse numero neste momento.
          </div>
        ) : null
      ) : null}
    </section>
  )
}
