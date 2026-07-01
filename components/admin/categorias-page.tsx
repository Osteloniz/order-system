'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { Categoria } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar categorias')
  return data
}

export function CategoriasPage() {
  const { data: categorias, isLoading } = useSWR<Categoria[]>('/api/admin/categorias', fetcher, {
    refreshInterval: 15000,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null)
  const [deletingCategoria, setDeletingCategoria] = useState<Categoria | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nome, setNome] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const categoriasFiltradas = useMemo(() => {
    const lista = categorias ?? []
    const busca = search.trim().toLowerCase()
    if (!busca) return lista
    return lista.filter((categoria) => categoria.nome.toLowerCase().includes(busca))
  }, [categorias, search])

  const openNewDialog = () => {
    setEditingCategoria(null)
    setNome('')
    setMessage('')
    setDialogOpen(true)
  }

  const openEditDialog = (categoria: Categoria) => {
    setEditingCategoria(categoria)
    setNome(categoria.nome)
    setMessage('')
    setDialogOpen(true)
  }

  const openDeleteDialog = (categoria: Categoria) => {
    setDeletingCategoria(categoria)
    setMessage('')
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch(
        editingCategoria ? `/api/admin/categorias/${editingCategoria.id}` : '/api/admin/categorias',
        {
          method: editingCategoria ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome }),
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar categoria')
      await mutate('/api/admin/categorias')
      setDialogOpen(false)
      setMessage(editingCategoria ? 'Categoria atualizada.' : 'Categoria criada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar categoria')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCategoria) return
    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch(`/api/admin/categorias/${deletingCategoria.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Erro ao excluir categoria')
      await mutate('/api/admin/categorias')
      setDeleteDialogOpen(false)
      setDeletingCategoria(null)
      setMessage('Categoria excluida.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao excluir categoria')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Tags className="h-3.5 w-3.5" />
              Organizacao do cardapio
            </div>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Tags className="h-7 w-7 text-primary" />
              Categorias de produtos
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Organize o catalogo por grupos claros para o time interno e para quem compra no celular.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold">{categorias?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4">
              <p className="text-xs text-muted-foreground">Na busca</p>
              <p className="mt-1 text-2xl font-bold text-primary">{categoriasFiltradas.length}</p>
            </div>
            <div className="rounded-2xl border bg-background/82 p-4 sm:col-span-1 col-span-2">
              <p className="text-xs text-muted-foreground">Ordem visual</p>
              <p className="mt-1 text-sm font-semibold">Lista pronta para manutencao rapida</p>
            </div>
          </div>
        </div>
      </section>

      <Card className="border-border/70 bg-card/95">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2 xl:flex-1">
              <Label>Buscar categoria</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ex: Cookies, Combos, Bebidas"
                  className="h-11 rounded-2xl pl-9"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="h-11 rounded-2xl" onClick={openNewDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Nova categoria
              </Button>
              <Button className="h-11 rounded-2xl" variant="outline" onClick={() => mutate('/api/admin/categorias')}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            Exibindo {categoriasFiltradas.length} de {categorias?.length ?? 0} categoria(s).
          </div>
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : categorias?.length === 0 ? (
        <Card className="border-dashed border-border/70 bg-card/95">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tags className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhuma categoria cadastrada</p>
            <Button variant="outline" className="mt-4 rounded-2xl bg-transparent" onClick={openNewDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar primeira categoria
            </Button>
          </CardContent>
        </Card>
      ) : categoriasFiltradas.length === 0 ? (
        <Card className="border-dashed border-border/70 bg-card/95">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhuma categoria encontrada com essa busca.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {categoriasFiltradas.map((categoria, index) => (
            <Card key={categoria.id} className="overflow-hidden border-border/70 bg-card/98 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <h3 className="break-words font-semibold">{categoria.nome}</h3>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1">
                        Ordem visual pronta para lista mobile
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 sm:min-w-[220px]">
                    <Button variant="outline" className="h-11 rounded-2xl" onClick={() => openEditDialog(categoria)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl border-destructive/25 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(categoria)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] rounded-[1.6rem] p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingCategoria ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Cookies, Brownies, Combos..."
                required
                autoFocus
                className="h-11 rounded-2xl"
              />
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 text-sm text-muted-foreground">
              Use nomes curtos e claros para funcionar bem no catalogo e no admin mobile.
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setDialogOpen(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" className="h-11 rounded-2xl" disabled={isSubmitting || !nome.trim()}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {editingCategoria ? 'Salvar categoria' : 'Criar categoria'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] rounded-[1.4rem] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deletingCategoria?.nome}&quot;? Produtos dessa categoria podem exigir reorganizacao depois.
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
