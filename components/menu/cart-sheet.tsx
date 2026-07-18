'use client'

import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { useCart } from '@/contexts/cart-context'
import { formatarMoeda } from '@/lib/calc'
import { resolveProductOrderMode } from '@/lib/product-availability'
import { Badge } from '@/components/ui/badge'

interface CartSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckout: () => void
  canCheckout?: boolean
  allowEncomendaFallback?: boolean
}

export function CartSheet({
  open,
  onOpenChange,
  onCheckout,
  canCheckout = true,
  allowEncomendaFallback = true,
}: CartSheetProps) {
  const { itens, subtotal, atualizarQuantidade, removerItem } = useCart()
  const itensComDisponibilidade = itens.map((item) => ({
    ...item,
    statusDisponibilidade: resolveProductOrderMode({
      requestedQty: item.quantidade,
      ativoNoCatalogo: item.produto.ativo,
      estoqueDisponivel: item.produto.estoqueDisponivel ?? 0,
      disponivelParaEncomenda: item.produto.disponivelParaEncomenda,
      encomendaHabilitada: allowEncomendaFallback,
    }),
  }))
  const forceEncomenda = itensComDisponibilidade.some((item) => item.statusDisponibilidade === 'SOMENTE_ENCOMENDA')
  const possuiIndisponivel = itensComDisponibilidade.some((item) => item.statusDisponibilidade === 'INDISPONIVEL')
  const checkoutLiberado = canCheckout && !possuiIndisponivel

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col border-l border-border/80 bg-background sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Seu Carrinho
          </SheetTitle>
        </SheetHeader>

        {itens.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
            <p>Seu carrinho está vazio</p>
            <p className="text-sm">Adicione itens do menu</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto py-4 space-y-4">
              {itensComDisponibilidade.map(item => (
                <div
                  key={item.produto.id}
                  className="flex gap-3 rounded-[22px] border border-border/80 bg-card px-4 py-4 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-lg font-semibold text-foreground">
                        {item.produto.nome}
                      </h4>
                      {item.statusDisponibilidade === 'SOMENTE_ENCOMENDA' ? (
                        <Badge className="border border-warning/35 bg-warning/15 text-warning hover:bg-warning/15 dark:border-warning/35 dark:bg-warning/20 dark:text-white">
                          Sob encomenda
                        </Badge>
                      ) : null}
                      {item.statusDisponibilidade === 'INDISPONIVEL' ? (
                        <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-white">
                          Indisponivel
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatarMoeda(item.produto.preco)} cada
                    </p>
                    <p className="mt-2 text-2xl font-bold text-primary">
                      {formatarMoeda(item.produto.preco * item.quantidade)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removerItem(item.produto.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-full border-border/80 bg-background"
                        onClick={() => atualizarQuantidade(item.produto.id, item.quantidade - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-10 text-center text-lg font-medium">
                        {item.quantidade}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-full border-border/80 bg-background"
                        disabled={item.statusDisponibilidade === 'INDISPONIVEL'}
                        onClick={() => atualizarQuantidade(item.produto.id, item.quantidade + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SheetFooter className="border-t pt-4">
              <div className="w-full space-y-4">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Subtotal</span>
                  <span className="text-primary">{formatarMoeda(subtotal)}</span>
                </div>
                {!checkoutLiberado && !canCheckout && (
                  <p className="text-sm text-destructive">
                    Estamos fechados no momento. Volte em outro horário.
                  </p>
                )}
                {forceEncomenda && !possuiIndisponivel && (
                  <p className="text-sm text-warning dark:text-white/90">
                    Esse carrinho sera fechado como encomenda por causa de itens sem estoque imediato.
                  </p>
                )}
                {possuiIndisponivel && (
                  <p className="text-sm text-destructive dark:text-white/90">
                    Existem itens sem estoque e sem opcao de encomenda. Ajuste o carrinho para continuar.
                  </p>
                )}
                <Button
                  className="h-14 w-full rounded-2xl text-base"
                  onClick={onCheckout}
                  disabled={!checkoutLiberado}
                >
                  Finalizar Pedido
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
