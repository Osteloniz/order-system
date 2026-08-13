'use client'

import { ProductCard } from './product-card'
import type { Produto, Categoria } from '@/lib/types'

interface CategorySectionProps {
  categoria: Categoria & { produtos: Produto[] }
}

export function CategorySection({ categoria }: CategorySectionProps) {
  if (categoria.produtos.length === 0) return null

  return (
    <section id={`categoria-${categoria.id}`} className="scroll-mt-36">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Categoria</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{categoria.nome}</h2>
        </div>
        <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {categoria.produtos.length} {categoria.produtos.length === 1 ? 'opcao' : 'opcoes'}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {categoria.produtos.map(produto => (
          <ProductCard key={produto.id} produto={produto} />
        ))}
      </div>
    </section>
  )
}
