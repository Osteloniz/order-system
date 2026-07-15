'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Check,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS')
  const [message, setMessage] = useState('')

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoriaId: '',
    preco: '',
    imagensText: '',
    ativo: true,
    novidade: false,
  })

  const produtosFiltrados = useMemo(() => {
    const lista = produtos ?? []
    const busca = search.trim().toLowerCase()
    return lista.filter((produto) => {
      const textoBusca = `${produto.nome} ${produto.categoriaNome} ${produto.descricao || ''}`.toLowerCase()
      if (busca && !textoBusca.includes(busca)) return false
      if (statusFilter === 'ATIVOS' && !produto.ativo) return false
      if (statusFilter === 'INATIVOS' && produto.ativo) return false
      return true
    })
  }, [produtos, search, statusFilter])

  const resumo = useMemo(() => {
    const lista = produtos ?? []
    return {
      total: lista.length,
      ativos: lista.filter((produto) => produto.ativo).length,
      inativos: lista.filter((produto) => !produto.ativo).length,
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
      novidade: false,
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
      novidade: produto.novidade,
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
            novidade: formData.novidade,
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
      setMessage(!produto.ativo ? 'Produto ativado.' : 'Produto desativado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao atualizar status do produto')
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Package className="h-3.5 w-3.5" />
              Catalogo operacional
            </div>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Package className="h-7 w-7 text-primary" />
              Produtos
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Ajuste nome, descricao, preco, status e imagens mantendo o catalogo pronto para venda e para o time no mobile.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold">{resumo.total}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="mt-1 text-2xl font-bold text-primary">{resumo.ativos}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Inativos</p>
              <p className="mt-1 text-2xl font-bold text-secondary">{resumo.inativos}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Novidades</p>
              <p className="mt-1 text-2xl font-bold text-primary">{resumo.novidades}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Categorias</p>
              <p className="mt-1 text-2xl font-bold">{resumo.categorias}</p>
            </div>
          </div>
        </div>
      </section>

      <Card className="border-border/70 bg-card/95">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_220px] xl:flex-1">
              <div className="space-y-2">
                <Label>Buscar produto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome, descricao ou categoria"
                    className="h-11 rounded-2xl pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="ATIVOS">Somente ativos</SelectItem>
                    <SelectItem value="INATIVOS">Somente inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-auto">
              <Button className="h-11 rounded-2xl" onClick={openNewDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Novo produto
              </Button>
              <Button className="h-11 rounded-2xl" variant="outline" onClick={() => mutate('/api/admin/produtos')}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            Exibindo {produtosFiltrados.length} de {produtos?.length ?? 0} produto(s).
          </div>
        </CardContent>
      </Card>

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
        <div className="grid gap-4 xl:grid-cols-2">
          {produtosFiltrados.map((produto) => (
            <Card key={produto.id} className="overflow-hidden border-border/70 bg-card/98 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-semibold">{produto.nome}</h3>
                        <Badge variant="outline" className="text-xs">
                          {produto.categoriaNome}
                        </Badge>
                        {produto.novidade ? (
                          <Badge className="border-0 bg-primary text-primary-foreground hover:bg-primary">
                            <Sparkles className="mr-1 h-3.5 w-3.5" />
                            Novidade
                          </Badge>
                        ) : null}
                        {!produto.ativo ? (
                          <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15" variant="outline">
                            Inativo
                          </Badge>
                        ) : null}
                      </div>
                      {produto.descricao ? (
                        <p className="mt-2 text-sm text-muted-foreground">{produto.descricao}</p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Sem descricao cadastrada.</p>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-primary">{formatarMoeda(produto.preco)}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-primary/20 bg-primary/8 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="mt-1 font-semibold">{produto.ativo ? 'Ativo' : 'Inativo'}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-xs text-muted-foreground">Menu</p>
                      <p className="mt-1 font-semibold">{produto.novidade ? 'Em novidades' : 'Padrao'}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-xs text-muted-foreground">Imagens</p>
                      <p className="mt-1 font-semibold">{produto.imagens?.length || (produto.imagemUrl ? 1 : 0)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
                      <Switch checked={produto.ativo} onCheckedChange={() => handleToggleAtivo(produto)} />
                      <span className="text-sm text-muted-foreground">Disponivel no catalogo</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" className="h-11 rounded-2xl" onClick={() => openEditDialog(produto)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 rounded-2xl border-destructive/25 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(produto)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto rounded-[1.6rem] p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingProduto ? 'Editar produto' : 'Novo produto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                  className="h-11 rounded-2xl"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="descricao">Descricao</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData((p) => ({ ...p, descricao: e.target.value }))}
                  rows={3}
                  className="rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Select
                  value={formData.categoriaId}
                  onValueChange={(value) => setFormData((p) => ({ ...p, categoriaId: value }))}
                >
                  <SelectTrigger className="h-11 rounded-2xl">
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

              <div className="space-y-2">
                <Label htmlFor="preco">Preco (R$)</Label>
                <Input
                  id="preco"
                  value={formData.preco}
                  onChange={(e) => setFormData((p) => ({ ...p, preco: e.target.value }))}
                  placeholder="0,00"
                  className="h-11 rounded-2xl"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="imagens">Imagens (URLs, uma por linha)</Label>
                <Textarea
                  id="imagens"
                  value={formData.imagensText}
                  onChange={(e) => setFormData((p) => ({ ...p, imagensText: e.target.value }))}
                  placeholder="https://exemplo.com/imagem-1.jpg&#10;https://exemplo.com/imagem-2.jpg"
                  rows={4}
                  className="rounded-2xl"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/75 px-4 py-3">
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, ativo: checked }))}
              />
              <Label htmlFor="ativo">Produto ativo no catalogo</Label>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/75 px-4 py-3">
              <Switch
                id="novidade"
                checked={formData.novidade}
                onCheckedChange={(checked) => setFormData((p) => ({ ...p, novidade: checked }))}
              />
              <Label htmlFor="novidade">Destacar como novidade no menu</Label>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setDialogOpen(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" className="h-11 rounded-2xl" disabled={isSubmitting || !formData.nome.trim()}>
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
        <AlertDialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] rounded-[1.4rem] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deletingProduto?.nome}&quot;? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
