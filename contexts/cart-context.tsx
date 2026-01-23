'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Produto, ItemCarrinho } from '@/lib/types'

interface CartContextType {
  itens: ItemCarrinho[]
  quantidadeTotal: number
  subtotal: number
  adicionarItem: (produto: Produto) => void
  removerItem: (produtoId: string) => void
  atualizarQuantidade: (produtoId: string, quantidade: number) => void
  limparCarrinho: () => void
  getQuantidadeProduto: (produtoId: string) => number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([])

  const adicionarItem = useCallback((produto: Produto) => {
    setItens(prev => {
      const existente = prev.find(item => item.produto.id === produto.id)
      if (existente) {
        return prev.map(item =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        )
      }
      return [...prev, { produto, quantidade: 1 }]
    })
  }, [])

  const removerItem = useCallback((produtoId: string) => {
    setItens(prev => prev.filter(item => item.produto.id !== produtoId))
  }, [])

  const atualizarQuantidade = useCallback((produtoId: string, quantidade: number) => {
    if (quantidade <= 0) {
      removerItem(produtoId)
      return
    }
    setItens(prev =>
      prev.map(item =>
        item.produto.id === produtoId
          ? { ...item, quantidade }
          : item
      )
    )
  }, [removerItem])

  const limparCarrinho = useCallback(() => {
    setItens([])
  }, [])

  const getQuantidadeProduto = useCallback((produtoId: string) => {
    const item = itens.find(i => i.produto.id === produtoId)
    return item?.quantidade || 0
  }, [itens])

  const quantidadeTotal = itens.reduce((acc, item) => acc + item.quantidade, 0)
  const subtotal = itens.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0)

  return (
    <CartContext.Provider
      value={{
        itens,
        quantidadeTotal,
        subtotal,
        adicionarItem,
        removerItem,
        atualizarQuantidade,
        limparCarrinho,
        getQuantidadeProduto
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart deve ser usado dentro de CartProvider')
  }
  return context
}
