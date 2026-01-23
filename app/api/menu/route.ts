import { NextResponse } from 'next/server'
import { categorias, produtos, configuracao } from '@/lib/mock-db'

// GET /api/menu - Retorna categorias + produtos ativos
export async function GET() {
  const produtosAtivos = produtos
    .filter(p => p.ativo)
    .sort((a, b) => a.ordem - b.ordem)
  
  const categoriasOrdenadas = categorias
    .sort((a, b) => a.ordem - b.ordem)
    .map(cat => ({
      ...cat,
      produtos: produtosAtivos.filter(p => p.categoriaId === cat.id)
    }))
    .filter(cat => cat.produtos.length > 0)

  return NextResponse.json({
    estabelecimento: configuracao.nomeEstabelecimento,
    enderecoRetirada: configuracao.enderecoRetirada,
    freteFixo: configuracao.freteFixo,
    categorias: categoriasOrdenadas
  })
}
