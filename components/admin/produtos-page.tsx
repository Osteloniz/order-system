'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Check,
  ChevronRight,
  ImageIcon,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatarMoeda } from '@/lib/calc'
import type { Categoria, Produto } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar produtos')
  return data
}

interface ProdutoComCategoria extends Produto {
  categoriaNome: string
}

export function ProdutosPage() {
  const { data: produtos, isLoading: loadingProdutos } = useSWR<ProdutoComCategoria[]>(
    '/api/admin/produtos',
    fetcher,
    { refreshInterval: 15000 },
  )
  const { data: categorias } = useSWR<Categoria[]>('/api/admin/categorias', fetcher)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null)
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INDISPONIVEIS' | 'DESCONTINUADOS'>('TODOS')
  const [message, setMessage] = useState('')

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoriaId: '',
    preco: '',
    imagensText: '',
    ativo: true,
    descontinuado: false,
    novidade: false,
    disponivelParaEncomenda: false,
  })

  const produtosFiltrados = useMemo(() => {
    const lista = produtos ?? []
    const busca = search.trim().toLowerCase()
    return lista.filter((produto) => {
      const textoBusca = `${produto.nome} ${produto.categoriaNome} ${produto.descricao || ''}`.toLowerCase()
      if (busca && !textoBusca.includes(busca)) return false
      if (statusFilter === 'ATIVOS' && (!produto.ativo || produto.descontinuado)) return false
      if (statusFilter === 'INDISPONIVEIS' && (produto.ativo || produto.descontinuado)) return false
      if (statusFilter === 'DESCONTINUADOS' && !produto.descontinuado) return false
      return true
    })
  }, [produtos, search, statusFilter])

  const resumo = useMemo(() => {
    const lista = produtos ?? []
    return {
      total: lista.length,
      ativos: lista.filter((produto) => produto.ativo && !produto.descontinuado).length,
      indisponiveis: lista.filter((produto) => !produto.ativo && !produto.descontinuado).length,
      descontinuados: lista.filter((produto) => produto.descontinuado).length,
      categorias: new Set(lista.map((produto) => produto.categoriaId)).size,
      novidades: lista.filter((produto) => produto.novidade).length,
    }
  }, [produtos])

  const openNewDialog = () => {
    setEditingProduto(null)
    setMessage('')
    setFormData({
      nome: '',
      descricao: '',
      categoriaId: '',
      preco: '',
      imagensText: '',
      ativo: true,
      descontinuado: false,
      novidade: false,
      disponivelParaEncomenda: false,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (produto: Produto) => {
    const imagens = produto.imagens?.length ? produto.imagens : produto.imagemUrl ? [produto.imagemUrl] : []
    setEditingProduto(produto)
    setMessage('')
    setFormData({
      nome: produto.nome,
      descricao: produto.descricao || '',
      categoriaId: produto.categoriaId,
      preco: (produto.preco / 100).toFixed(2).replace('.', ','),
      imagensText: imagens.join('\n'),
      ativo: produto.ativo,
      descontinuado: produto.descontinuado,
      novidade: produto.novidade,
      disponivelParaEncomenda: produto.disponivelParaEncomenda,
    })
    setDialogOpen(true)
  }

  const openDeleteDialog = (produto: Produto) => {
    setDeletingProduto(produto)
    setMessage('')
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    const precoNumero = Math.round(Number.parseFloat(formData.preco.replace(',', '.')) * 100)
    const imagens = formData.imagensText
      .split('\n')
      .map((url) => url.trim())
      .filter(Boolean)

    try {
      const response = await fetch(
        editingProduto ? `/api/admin/produtos/${editingProduto.id}` : '/api/admin/produtos',
        {
          method: editingProduto ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: formData.nome,
            descricao: formData.descricao || undefined,
            categoriaId: formData.categoriaId,
            preco: precoNumero,
            imagens,
            ativo: formData.ativo,
            descontinuado: formData.descontinuado,
            novidade: formData.novidade,
            disponivelParaEncomenda: formData.disponivelParaEncomenda,
          }),
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar produto')
      await mutate('/api/admin/produtos')
      setDialogOpen(false)
      setMessage(editingProduto ? 'Produto atualizado.' : 'Produto criado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar produto')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProduto) return
    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch(`/api/admin/produtos/${deletingProduto.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Erro ao excluir produto')
      await mutate('/api/admin/produtos')
      setDeleteDialogOpen(false)
      setDeletingProduto(null)
      setMessage('Produto excluido.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao excluir produto')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleAtivo = async (produto: Produto) => {
    setMessage('')
    try {
      const response = await fetch(`/api/admin/produtos/${produto.id}/ativo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !produto.ativo }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar status do produto')
      await mutate('/api/admin/produtos')
      setMessage(!produto.ativo ? 'Produto liberado no catalogo.' : 'Produto marcado como indisponivel no catalogo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao atualizar status do produto')
    }
  }

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Produtos</h1>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Catálogo, preço e disponibilidade.</p>
        </div>
        <Button size="sm" className="h-9 shrink-0 rounded-lg" onClick={openNewDialog}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.total}</strong> total</span>
        <span className="shrink-0 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5 text-primary"><strong>{resumo.ativos}</strong> disponíveis</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.indisponiveis}</strong> indisponíveis</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.descontinuados}</strong> descontinuados</span>
        <span className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5"><strong>{resumo.categorias}</strong> categorias</span>
      </div>

      <section className="rounded-xl border border-border/70 bg-card p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_42px] gap-2 sm:grid-cols-[minmax(0,1fr)_190px_42px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" className="h-9 rounded-lg pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="hidden h-9 rounded-lg sm:flex"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="ATIVOS">Disponíveis</SelectItem>
              <SelectItem value="INDISPONIVEIS">Indisponíveis</SelectItem>
              <SelectItem value="DESCONTINUADOS">Descontinuados</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => mutate('/api/admin/produtos')} aria-label="Atualizar produtos">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 sm:hidden">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="ATIVOS">Disponíveis</SelectItem>
              <SelectItem value="INDISPONIVEIS">Indisponíveis</SelectItem>
              <SelectItem value="DESCONTINUADOS">Descontinuados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">{produtosFiltrados.length} de {produtos?.length ?? 0} produto(s)</p>
      </section>

      {message ? (
        <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      {loadingProdutos ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : produtos?.length === 0 ? (
        <Card className="border-dashed border-border/70 bg-card/95">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhum produto cadastrado</p>
            <Button variant="outline" className="mt-4 rounded-2xl bg-transparent" onClick={openNewDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar primeiro produto
            </Button>
          </CardContent>
        </Card>
      ) : produtosFiltrados.length === 0 ? (
        <Card className="border-dashed border-border/70 bg-card/95">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhum produto encontrado com esses filtros.</p>
          </CardContent>
        </Card>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card" aria-label="Lista de produtos">
          {produtosFiltrados.map((produto) => (
            <div key={produto.id} className="flex items-center gap-2.5 border-b border-border/60 p-2.5 last:border-b-0">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => openEditDialog(produto)}>
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/25 bg-cover bg-center"
                  style={(produto.imagens?.[0] || produto.imagemUrl) ? { backgroundImage: `url(${produto.imagens?.[0] || produto.imagemUrl})` } : undefined}
                >
                  {!(produto.imagens?.[0] || produto.imagemUrl) ? <ImageIcon className="h-5 w-5 text-muted-foreground" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{produto.nome}</span>
                    {produto.novidade ? <Sparkles className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Novidade" /> : null}
                    {produto.disponivelParaEncomenda ? <ShoppingBasket className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Aceita encomenda" /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{produto.categoriaNome}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px]">
                    <span className={produto.descontinuado ? 'text-destructive' : produto.ativo ? 'text-primary' : 'text-warning-foreground'}>
                      {produto.descontinuado ? 'Descontinuado' : produto.ativo ? 'Disponível' : 'Indisponível'}
                    </span>
                    <span className="text-muted-foreground">· {produto.imagens?.length || (produto.imagemUrl ? 1 : 0)} imagem(ns)</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-primary">{formatarMoeda(produto.preco)}</span>
                  <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground" />
                </span>
              </button>
              <Switch checked={produto.ativo} onCheckedChange={() => handleToggleAtivo(produto)} disabled={produto.descontinuado} aria-label={`Disponibilidade de ${produto.nome}`} />
            </div>
          ))}
        </section>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[min(92dvh,760px)] w-[calc(100vw-0.75rem)] max-w-2xl flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base">{editingProduto ? 'Editar produto' : 'Novo produto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="nome" className="text-xs">Nome</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                  className="h-9 rounded-lg"
                  required
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="descricao" className="text-xs">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData((p) => ({ ...p, descricao: e.target.value }))}
                  rows={2}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="categoria" className="text-xs">Categoria</Label>
                <Select
                  value={formData.categoriaId}
                  onValueChange={(value) => setFormData((p) => ({ ...p, categoriaId: value }))}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preco" className="text-xs">Preço (R$)</Label>
                <Input
                  id="preco"
                  value={formData.preco}
                  onChange={(e) => setFormData((p) => ({ ...p, preco: e.target.value }))}
                  placeholder="0,00"
                  className="h-9 rounded-lg"
                  required
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="imagens" className="text-xs">Imagens (uma URL por linha)</Label>
                <Textarea
                  id="imagens"
                  value={formData.imagensText}
                  onChange={(e) => setFormData((p) => ({ ...p, imagensText: e.target.value }))}
                  placeholder="https://exemplo.com/imagem-1.jpg&#10;https://exemplo.com/imagem-2.jpg"
                  rows={3}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/75 px-3 py-2">
              <Label htmlFor="ativo" className="text-xs">Disponível no catálogo</Label>
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, ativo: checked }))}
                disabled={formData.descontinuado}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/75 px-3 py-2">
              <Label htmlFor="descontinuado" className="text-xs">Descontinuar e ocultar</Label>
              <Switch
                id="descontinuado"
                checked={formData.descontinuado}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, descontinuado: checked }))}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/75 px-3 py-2">
              <Label htmlFor="novidade" className="text-xs">Destacar como novidade</Label>
              <Switch
                id="novidade"
                checked={formData.novidade}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, novidade: checked }))}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/75 px-3 py-2">
              <Label htmlFor="disponivelParaEncomenda" className="text-xs">Permitir sob encomenda</Label>
              <Switch
                id="disponivelParaEncomenda"
                checked={formData.disponivelParaEncomenda}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, disponivelParaEncomenda: checked }))}
              />
            </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-border/70 bg-background/95 p-3">
              {editingProduto ? (
                <Button type="button" variant="ghost" size="sm" className="mr-auto h-9 rounded-lg text-destructive hover:text-destructive" onClick={() => { setDialogOpen(false); openDeleteDialog(editingProduto) }}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setDialogOpen(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="h-9 rounded-lg" disabled={isSubmitting || !formData.nome.trim()}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {editingProduto ? 'Salvar produto' : 'Criar produto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-0.75rem)] max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deletingProduto?.nome}&quot;? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
