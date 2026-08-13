'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { MapPin, Search, Sparkles, Store, X } from 'lucide-react'
import { CategorySection } from './category-section'
import { CartButton } from './cart-button'
import { CartSheet } from './cart-sheet'
import { ProductCard } from './product-card'
import { RecentOrders } from './recent-orders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { restoreMenuScrollPosition, saveMenuScrollPosition } from '@/lib/customer-session'
import type { CheckoutPublicoConfig, Produto, Categoria, LojaFuncionamentoStatus } from '@/lib/types'

interface MenuData {
  estabelecimento: string
  enderecoRetirada: string
  freteBase: number
  freteRaioKm: number
  freteKmExcedente: number
  estabelecimentoLat: number
  estabelecimentoLng: number
  isOpen: boolean
  lojaStatus: LojaFuncionamentoStatus
  checkoutPublico: CheckoutPublicoConfig
  novidades: Produto[]
  indisponiveis: Produto[]
  categorias: (Categoria & { produtos: Produto[] })[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao carregar menu')
  }

  return data
}

export function MenuPage() {
  const router = useRouter()
  const [cartOpen, setCartOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const { data, isLoading, error } = useSWR<MenuData>('/api/menu', fetcher)
  const categorias = Array.isArray(data?.categorias) ? data.categorias : []
  const novidades = Array.isArray(data?.novidades) ? data.novidades : []
  const indisponiveis = Array.isArray(data?.indisponiveis) ? data.indisponiveis : []
  const canCheckout = data?.isOpen ?? true
  const normalizedSearch = productSearch.trim().toLocaleLowerCase('pt-BR')
  const matchesSearch = (produto: Produto) => {
    if (!normalizedSearch) return true
    return `${produto.nome} ${produto.descricao ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }
  const categoriasVisiveis = categorias
    .map((categoria) => ({ ...categoria, produtos: categoria.produtos.filter(matchesSearch) }))
    .filter((categoria) => categoria.produtos.length > 0)
  const novidadesVisiveis = novidades.filter(matchesSearch)
  const indisponiveisVisiveis = indisponiveis.filter(matchesSearch)
  const totalProdutos = categorias.reduce((total, categoria) => total + categoria.produtos.length, 0)
  const totalResultados = categoriasVisiveis.reduce((total, categoria) => total + categoria.produtos.length, 0)

  useEffect(() => {
    if (!isLoading) {
      restoreMenuScrollPosition()
    }
  }, [isLoading])

  const handleCheckout = () => {
    saveMenuScrollPosition()
    setCartOpen(false)
    router.push('/checkout')
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
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 shadow-[0_8px_30px_rgba(66,28,20,0.05)] backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-3.5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <Store className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Cardapio online</p>
                      <h1 className="truncate text-lg font-bold leading-tight text-foreground">{data?.estabelecimento}</h1>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 pl-1 text-xs text-muted-foreground dark:text-white/80">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{data?.enderecoRetirada}</span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={data?.isOpen
                    ? 'shrink-0 rounded-full border-success/30 bg-success/10 px-3 py-1.5 text-success'
                    : 'shrink-0 rounded-full border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive'}
                >
                  <span className={`mr-1.5 h-2 w-2 rounded-full ${data?.isOpen ? 'bg-success' : 'bg-destructive'}`} />
                  {data?.isOpen ? 'Aberto' : 'Fechado'}
                </Badge>
              </div>
            </>
          )}
        </div>
      </header>

      {data && !data.isOpen && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {data.lojaStatus?.message || 'Estamos fechados no momento. O carrinho fica disponivel, mas nao e possivel finalizar pedidos.'}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 pt-4">
        <section className="overflow-hidden rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-accent/20 p-5 shadow-sm">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Escolha seus favoritos</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight">O que vai adoçar seu dia?</h2>
              <p className="mt-2 text-sm text-muted-foreground">{totalProdutos} opcoes no cardapio para comprar ou encomendar.</p>
            </div>
            <Sparkles className="h-8 w-8 shrink-0 text-warning" />
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Buscar sabor ou recheio"
              className="h-12 rounded-2xl border-border/80 bg-background/90 pl-10 pr-11 text-base shadow-sm"
              aria-label="Buscar produto no cardapio"
            />
            {productSearch ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-xl"
                onClick={() => setProductSearch('')}
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {normalizedSearch ? (
            <p className="mt-2 text-xs text-muted-foreground">{totalResultados} resultado(s) encontrado(s).</p>
          ) : null}
        </section>
      </main>

      <RecentOrders />

      {/* Category Navigation */}
      {(novidadesVisiveis.length > 0 || categoriasVisiveis.length > 0 || indisponiveisVisiveis.length > 0) && (
        <nav className="sticky top-[86px] z-30 mt-4 overflow-x-auto border-y border-border/70 bg-card/92 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl gap-2 px-4 py-2.5">
            {novidadesVisiveis.length > 0 ? (
              <a
                href="#novidades"
                className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Novidades
              </a>
            ) : null}
            {categoriasVisiveis.map(cat => (
              <a
                key={cat.id}
                href={`#categoria-${cat.id}`}
                className="px-4 py-2 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap"
              >
                {cat.nome}
              </a>
            ))}
            {indisponiveisVisiveis.length > 0 ? (
              <a
                href="#indisponiveis"
                className="px-4 py-2 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap"
              >
                Indisponiveis
              </a>
            ) : null}
          </div>
        </nav>
      )}

      {/* Menu Content */}
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
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
        ) : categoriasVisiveis.length > 0 || novidadesVisiveis.length > 0 || indisponiveisVisiveis.length > 0 ? (
          <>
            {novidadesVisiveis.length > 0 ? (
              <section id="novidades" className="scroll-mt-20 space-y-4">
                <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-5">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="text-xl font-bold">Novidades do cardapio</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground dark:text-white/80">
                    Veja primeiro o que acabou de entrar no menu.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {novidadesVisiveis.map((produto) => (
                    <ProductCard key={`novidade-${produto.id}`} produto={produto} />
                  ))}
                </div>
              </section>
            ) : null}

            {categoriasVisiveis.map(categoria => (
              <CategorySection key={categoria.id} categoria={categoria} />
            ))}

            {indisponiveisVisiveis.length > 0 ? (
              <section id="indisponiveis" className="scroll-mt-20 space-y-4">
                <div className="rounded-3xl border border-destructive/25 bg-destructive/8 p-5">
                  <div className="flex items-center gap-2 text-destructive">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="text-xl font-bold">Indisponiveis no momento</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground dark:text-white/80">
                    Esses sabores continuam no cardapio, mas estao bloqueados para pedido agora.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {indisponiveisVisiveis.map((produto) => (
                    <ProductCard key={`indisponivel-${produto.id}`} produto={produto} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="rounded-[28px] border border-dashed border-border/80 bg-card/70 px-5 py-12 text-center">
            <Search className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 font-semibold">Nenhum produto encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente buscar por outro sabor ou limpe o campo de busca.</p>
            {productSearch ? (
              <Button type="button" variant="outline" className="mt-4 rounded-2xl" onClick={() => setProductSearch('')}>
                Limpar busca
              </Button>
            ) : null}
          </div>
        )}
      </main>

      {/* Cart Button & Sheet */}
      <CartButton onClick={() => setCartOpen(true)} />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={handleCheckout}
        canCheckout={canCheckout}
        closedMessage={data?.lojaStatus?.message}
        allowEncomendaFallback={data?.checkoutPublico.entregas.encomenda ?? true}
      />
    </div>
  )
}
