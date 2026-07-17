'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Clock, ReceiptText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarMoeda } from '@/lib/calc'
import { clearRecentOrdersForCurrentCustomer, getRecentOrders } from '@/lib/customer-session'
import { ORDER_ACCESS_HEADER } from '@/lib/public-order-access'
import { statusPagamentoLabelsLong, statusPedidoShortLabels } from '@/lib/order-display'
import type { PedidoPublico, RecentOrderReference } from '@/lib/types'

const fetcher = async ([url, accessToken]: [string, string]) => {
  const response = await fetch(url, {
    headers: accessToken ? { [ORDER_ACCESS_HEADER]: accessToken } : undefined,
  })
  if (!response.ok) throw new Error('Pedido nao encontrado')
  return response.json()
}

function RecentOrderCard({ order }: { order: RecentOrderReference }) {
  const { data: pedido } = useSWR<PedidoPublico>([`/api/pedidos/${order.id}`, order.accessToken || ''], fetcher, {
    refreshInterval: 15000,
    shouldRetryOnError: false,
  })

  if (!pedido) return null

  return (
    <Link
      href={`/confirmacao/${pedido.id}`}
      className="block rounded-lg border border-border bg-card px-3 py-3 hover:bg-secondary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Pedido #{pedido.id.slice(-8).toUpperCase()}</p>
          <p className="text-sm text-muted-foreground dark:text-foreground/76">{formatarMoeda(pedido.total)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline">{statusPedidoShortLabels[pedido.status]}</Badge>
          <span className="text-xs text-muted-foreground dark:text-foreground/72">{statusPagamentoLabelsLong[pedido.statusPagamento]}</span>
        </div>
      </div>
    </Link>
  )
}

export function RecentOrders() {
  const [orders, setOrders] = useState<RecentOrderReference[]>([])

  useEffect(() => {
    setOrders(getRecentOrders())
  }, [])

  if (orders.length === 0) return null

  return (
    <section className="max-w-2xl mx-auto px-4 pt-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Seus últimos pedidos</h2>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground dark:text-foreground/72">
          <Clock className="h-3 w-3" />
          neste aparelho
        </div>
      </div>
      <div className="space-y-2">
        {orders.map((order) => (
          <RecentOrderCard key={order.id} order={order} />
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="mt-2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground dark:text-foreground/76"
        onClick={() => {
          clearRecentOrdersForCurrentCustomer()
          setOrders([])
        }}
      >
        Limpar histórico deste aparelho
      </Button>
    </section>
  )
}
