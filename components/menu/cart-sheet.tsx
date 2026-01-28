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

interface CartSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckout: () => void
  canCheckout?: boolean
}

export function CartSheet({ open, onOpenChange, onCheckout, canCheckout = true }: CartSheetProps) {
  const { itens, subtotal, atualizarQuantidade, removerItem } = useCart()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
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
              {itens.map(item => (
                <div
                  key={item.produto.id}
                  className="flex gap-3 p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">
                      {item.produto.nome}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {formatarMoeda(item.produto.preco)} cada
                    </p>
                    <p className="text-primary font-semibold mt-1">
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
                        className="h-7 w-7 bg-transparent"
                        onClick={() => atualizarQuantidade(item.produto.id, item.quantidade - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium text-sm">
                        {item.quantidade}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 bg-transparent"
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
                {!canCheckout && (
                  <p className="text-sm text-destructive">
                    Estamos fechados no momento. Volte em outro horário.
                  </p>
                )}
                <Button
                  className="w-full h-12 text-base"
                  onClick={onCheckout}
                  disabled={!canCheckout}
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
