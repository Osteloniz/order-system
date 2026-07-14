import React from "react"
import { CartProvider } from '@/contexts/cart-context'
import { PublicThemeEnforcer } from '@/components/public-theme-enforcer'

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      <PublicThemeEnforcer />
      {children}
    </CartProvider>
  )
}
