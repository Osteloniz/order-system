'use client'
/* eslint-disable @next/next/no-img-element */

import { Plus, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { useCart } from '@/contexts/cart-context'
import { formatarMoeda } from '@/lib/calc'
import type { Produto } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  produto: Produto
}

export function ProductCard({ produto }: ProductCardProps) {
  const { adicionarItem, atualizarQuantidade, getQuantidadeProduto } = useCart()
  const quantidade = getQuantidadeProduto(produto.id)
  const statusDisponibilidade = produto.statusDisponibilidade ?? 'DISPONIVEL'
  const bloqueado = statusDisponibilidade === 'INDISPONIVEL'
  const imagens = produto.imagens?.length
    ? produto.imagens
    : produto.imagemUrl
      ? [produto.imagemUrl]
      : []

  return (
    <Card className={cn(
      'overflow-hidden rounded-[18px] border-border/80 bg-card/95 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
      quantidade > 0 && 'border-primary/35 bg-primary/[0.035] ring-1 ring-primary/10',
      bloqueado && 'bg-muted/30'
    )}>
      <CardContent className="p-3 sm:p-3.5">
        <div className={cn('min-w-0', imagens.length > 0 && 'grid grid-cols-[84px_minmax(0,1fr)] gap-3 sm:grid-cols-[140px_minmax(0,1fr)]')}>
          {imagens.length > 0 && (
            <div className="w-full shrink-0">
              {imagens.length > 1 ? (
                <Carousel className="w-full">
                  <CarouselContent>
                    {imagens.map((url, index) => (
                      <CarouselItem key={`${produto.id}-${index}`}>
                        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted sm:aspect-[4/3]">
                          <img
                            src={url}
                            alt={`${produto.nome} - imagem ${index + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-1 h-7 w-7" variant="secondary" />
                  <CarouselNext className="right-1 h-7 w-7" variant="secondary" />
                </Carousel>
              ) : (
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted sm:aspect-[4/3]">
                  <img
                    src={imagens[0]}
                    alt={`${produto.nome} - imagem`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words font-semibold leading-tight text-foreground">{produto.nome}</h3>
                {produto.novidade ? (
                  <Badge className="border border-primary/25 bg-primary/14 text-primary hover:bg-primary/14 dark:border-primary/35 dark:bg-primary/30 dark:text-white">
                    Novidade
                  </Badge>
                ) : null}
                {statusDisponibilidade === 'SOMENTE_ENCOMENDA' ? (
                  <Badge className="border border-warning/35 bg-warning/15 text-warning hover:bg-warning/15 dark:border-warning/35 dark:bg-warning/20 dark:text-white">
                    Somente encomenda
                  </Badge>
                ) : null}
                {statusDisponibilidade === 'INDISPONIVEL' ? (
                  <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-white">
                    Indisponivel hoje
                  </Badge>
                ) : null}
              </div>
              {produto.descricao && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground dark:text-white/85">
                  {produto.descricao}
                </p>
              )}
              {statusDisponibilidade === 'SOMENTE_ENCOMENDA' ? (
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-warning dark:text-white/90">
                  Esse sabor entra apenas em pedidos de encomenda.
                </p>
              ) : null}
              {statusDisponibilidade === 'INDISPONIVEL' ? (
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-destructive dark:text-white/90">
                  Sem estoque e sem liberacao para encomenda agora.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">A partir de</p>
                <p className="text-base font-bold text-primary sm:text-lg">{formatarMoeda(produto.preco)}</p>
              </div>
              {quantidade === 0 ? (
                <Button
                  size="sm"
                  onClick={() => adicionarItem(produto)}
                  className="h-9 gap-1 rounded-xl px-3"
                  disabled={bloqueado}
                >
                  <Plus className="h-4 w-4" />
                  {statusDisponibilidade === 'SOMENTE_ENCOMENDA' ? 'Encomendar' : 'Adicionar'}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-2xl border border-primary/25 bg-background/85 p-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-xl border-0 bg-transparent"
                    onClick={() => atualizarQuantidade(produto.id, quantidade - 1)}
                    aria-label={`Remover uma unidade de ${produto.nome}`}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold text-primary">{quantidade}</span>
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    disabled={bloqueado}
                    onClick={() => atualizarQuantidade(produto.id, quantidade + 1)}
                    aria-label={`Adicionar uma unidade de ${produto.nome}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
