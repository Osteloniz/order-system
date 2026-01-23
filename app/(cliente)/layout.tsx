import React from "react"
import { CartProvider } from '@/contexts/cart-context'

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      {children}
    </CartProvider>
  )
}
