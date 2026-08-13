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
    <div className="fixed inset-x-3 bottom-3 z-50 supports-[padding:max(0px)]:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:left-auto md:right-6 md:max-w-sm">
      <Button
        onClick={onClick}
        className="h-14 w-full gap-3 rounded-[20px] border border-primary-foreground/10 text-base shadow-[0_16px_40px_rgba(64,99,26,0.28)]"
        size="lg"
      >
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          <span className="bg-primary-foreground text-primary rounded-full h-6 w-6 flex items-center justify-center text-sm font-bold">
            {quantidadeTotal}
          </span>
        </div>
        <span className="flex-1 text-left">Ver carrinho</span>
        <span className="font-bold">{formatarMoeda(subtotal)}</span>
      </Button>
    </div>
  )
}
