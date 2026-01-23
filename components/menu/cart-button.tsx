'use client'

import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/contexts/cart-context'
import { formatarMoeda } from '@/lib/calc'

interface CartButtonProps {
  onClick: () => void
}

export function CartButton({ onClick }: CartButtonProps) {
  const { quantidadeTotal, subtotal } = useCart()

  if (quantidadeTotal === 0) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-6 md:max-w-sm">
      <Button
        onClick={onClick}
        className="w-full h-14 text-base shadow-lg gap-3"
        size="lg"
      >
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          <span className="bg-primary-foreground text-primary rounded-full h-6 w-6 flex items-center justify-center text-sm font-bold">
            {quantidadeTotal}
          </span>
        </div>
        <span className="flex-1">Ver carrinho</span>
        <span className="font-bold">{formatarMoeda(subtotal)}</span>
      </Button>
    </div>
  )
}
