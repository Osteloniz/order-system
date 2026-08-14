'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { MapPin, Search, Sparkles, X } from 'lucide-react'
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
        <div className="mx-auto max-w-5xl px-3 py-2.5 sm:px-4">
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
                    <Image src="/brand/brookie-mark-color.jpg" alt="Brookie Pregiato" width={44} height={44} priority className="h-10 w-10 shrink-0 rounded-full border border-secondary object-cover shadow-sm" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">Cardapio Brookie</p>
                      <h1 className="truncate text-base font-bold leading-tight text-foreground sm:text-lg">{data?.estabelecimento}</h1>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 pl-1 text-[11px] text-muted-foreground dark:text-white/80">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{data?.enderecoRetirada}</span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={data?.isOpen
                    ? 'shrink-0 rounded-full border-success/30 bg-success/10 px-2.5 py-1 text-[11px] text-success'
                    : 'shrink-0 rounded-full border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive'}
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

      <main className="mx-auto max-w-5xl px-3 pt-3 sm:px-4 sm:pt-4">
        <section className="relative overflow-hidden rounded-[22px] border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-accent/20 p-4 shadow-sm sm:p-5">
          <div className="relative z-10 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Escolha seus favoritos</p>
              <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">Cookies artesanais, do seu jeito</h2>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">{totalProdutos} opcoes para comprar agora ou encomendar.</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Sparkles className="h-6 w-6 text-warning" />
              <Image src="/brand/brookie-mark-color.jpg" alt="" width={76} height={76} className="h-16 w-16 rounded-full border-2 border-secondary object-cover shadow-sm" />
            </div>
          </div>
          <div className="relative z-10 mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Buscar sabor ou recheio"
              className="h-11 rounded-xl border-border/80 bg-background/90 pl-10 pr-11 text-sm shadow-sm sm:text-base"
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
        <nav className="sticky top-[70px] z-30 mt-3 overflow-x-auto border-y border-border/70 bg-card/92 backdrop-blur-xl sm:top-[78px]">
          <div className="mx-auto flex max-w-5xl gap-1.5 px-3 py-2 sm:px-4">
            {novidadesVisiveis.length > 0 ? (
              <a
                href="#novidades"
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 whitespace-nowrap sm:text-sm"
              >
                Novidades
              </a>
            ) : null}
            {categoriasVisiveis.map(cat => (
              <a
                key={cat.id}
                href={`#categoria-${cat.id}`}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground whitespace-nowrap sm:text-sm"
              >
                {cat.nome}
              </a>
            ))}
            {indisponiveisVisiveis.length > 0 ? (
              <a
                href="#indisponiveis"
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground whitespace-nowrap sm:text-sm"
              >
                Indisponiveis
              </a>
            ) : null}
          </div>
        </nav>
      )}

      {/* Menu Content */}
      <main className="mx-auto max-w-5xl space-y-6 px-3 py-4 sm:px-4 sm:py-6">
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
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="text-lg font-bold sm:text-xl">Novidades do cardapio</h2>
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
                <div className="rounded-2xl border border-destructive/25 bg-destructive/8 p-4">
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
