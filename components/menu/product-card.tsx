'use client'

import { Plus, Minus } from 'lucide-react'
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

interface ProductCardProps {
  produto: Produto
}

export function ProductCard({ produto }: ProductCardProps) {
  const { adicionarItem, atualizarQuantidade, getQuantidadeProduto } = useCart()
  const quantidade = getQuantidadeProduto(produto.id)
  const imagens = produto.imagens?.length
    ? produto.imagens
    : produto.imagemUrl
      ? [produto.imagemUrl]
      : []

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {imagens.length > 0 && (
            <div className="w-full sm:w-40 sm:shrink-0">
              {imagens.length > 1 ? (
                <Carousel className="w-full">
                  <CarouselContent>
                    {imagens.map((url, index) => (
                      <CarouselItem key={`${produto.id}-${index}`}>
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
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
                  <CarouselPrevious className="left-2" variant="secondary" />
                  <CarouselNext className="right-2" variant="secondary" />
                </Carousel>
              ) : (
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
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

          <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{produto.nome}</h3>
              {produto.descricao && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {produto.descricao}
                </p>
              )}
              <p className="text-primary font-bold mt-2">
                {formatarMoeda(produto.preco)}
              </p>
            </div>

            <div className="flex flex-col items-end justify-between self-end sm:self-auto">
              {quantidade === 0 ? (
                <Button
                  size="sm"
                  onClick={() => adicionarItem(produto)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 bg-transparent"
                    onClick={() => atualizarQuantidade(produto.id, quantidade - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-medium">{quantidade}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 bg-transparent"
                    onClick={() => atualizarQuantidade(produto.id, quantidade + 1)}
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
