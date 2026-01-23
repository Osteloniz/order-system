'use client'

import { ProductCard } from './product-card'
import type { Produto, Categoria } from '@/lib/types'

interface CategorySectionProps {
  categoria: Categoria & { produtos: Produto[] }
}

export function CategorySection({ categoria }: CategorySectionProps) {
  if (categoria.produtos.length === 0) return null

  return (
    <section id={`categoria-${categoria.id}`} className="scroll-mt-20">
      <h2 className="text-xl font-bold text-foreground mb-4 pb-2 border-b border-border">
        {categoria.nome}
      </h2>
      <div className="grid gap-3">
        {categoria.produtos.map(produto => (
          <ProductCard key={produto.id} produto={produto} />
        ))}
      </div>
    </section>
  )
}
