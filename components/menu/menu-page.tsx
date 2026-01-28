'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Store, MapPin, ArrowLeftRight } from 'lucide-react'
import { CategorySection } from './category-section'
import { CartButton } from './cart-button'
import { CartSheet } from './cart-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import type { Produto, Categoria } from '@/lib/types'

interface MenuData {
  estabelecimento: string
  enderecoRetirada: string
  freteBase: number
  freteRaioKm: number
  freteKmExcedente: number
  estabelecimentoLat: number
  estabelecimentoLng: number
  isOpen: boolean
  categorias: (Categoria & { produtos: Produto[] })[]
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function MenuPage() {
  const router = useRouter()
  const [cartOpen, setCartOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  const { data, isLoading, error } = useSWR<MenuData>('/api/menu', fetcher)
  const canCheckout = data?.isOpen ?? true

  const handleCheckout = () => {
    setCartOpen(false)
    router.push('/checkout')
  }

  const handleSwitchTenant = async () => {
    setIsSwitching(true)
    try {
      await fetch('/api/tenant/clear', { method: 'POST' })
    } finally {
      router.push('/')
      setIsSwitching(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-destructive mb-2">Erro ao carregar menu</h1>
          <p className="text-muted-foreground">Tente novamente mais tarde</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <Store className="h-5 w-5" />
                    <h1 className="text-xl font-bold">{data?.estabelecimento}</h1>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="h-4 w-4" />
                    <span>{data?.enderecoRetirada}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSwitchTenant}
                    disabled={isSwitching}
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Trocar loja
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {data && !data.isOpen && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm">
            Estamos fechados no momento. O carrinho fica disponível, mas não é possível finalizar pedidos.
          </div>
        </div>
      )}

      {/* Category Navigation */}
      {data && data.categorias.length > 0 && (
        <nav className="bg-card border-b border-border sticky top-[72px] z-30 overflow-x-auto">
          <div className="max-w-2xl mx-auto px-4 py-2 flex gap-2">
            {data.categorias.map(cat => (
              <a
                key={cat.id}
                href={`#categoria-${cat.id}`}
                className="px-4 py-2 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap"
              >
                {cat.nome}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Menu Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="space-y-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.categorias.map(categoria => (
          <CategorySection key={categoria.id} categoria={categoria} />
        ))}
      </main>

      {/* Cart Button & Sheet */}
      <CartButton onClick={() => setCartOpen(true)} />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={handleCheckout}
        canCheckout={canCheckout}
      />
    </div>
  )
}
