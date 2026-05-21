'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Check, Landmark, Loader2, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { CategoriaFinanceira, EscopoCategoriaFinanceira } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar categorias financeiras')
  return data
}

const scopeLabels: Record<EscopoCategoriaFinanceira, string> = {
  PAGAR: 'Contas a pagar',
  RECEBER: 'Contas a receber',
  AMBOS: 'Pagar e receber',
}

const scopeIcons = {
  PAGAR: ArrowDownCircle,
  RECEBER: ArrowUpCircle,
  AMBOS: ArrowLeftRight,
} satisfies Record<EscopoCategoriaFinanceira, typeof ArrowDownCircle>

export function CategoriasFinanceirasPage() {
  const { data: categorias, isLoading } = useSWR<CategoriaFinanceira[]>('/api/admin/categorias-financeiras', fetcher)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCategoria, setEditingCategoria] = useState<CategoriaFinanceira | null>(null)
  const [deletingCategoria, setDeletingCategoria] = useState<CategoriaFinanceira | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nome, setNome] = useState('')
  const [escopo, setEscopo] = useState<EscopoCategoriaFinanceira>('PAGAR')

  const resumo = useMemo(() => {
    const lista = categorias ?? []
    return {
      total: lista.length,
      pagar: lista.filter((item) => item.escopo === 'PAGAR').length,
      receber: lista.filter((item) => item.escopo === 'RECEBER').length,
      ambos: lista.filter((item) => item.escopo === 'AMBOS').length,
    }
  }, [categorias])

  const openNewDialog = () => {
    setEditingCategoria(null)
    setNome('')
    setEscopo('PAGAR')
    setDialogOpen(true)
  }

  const openEditDialog = (categoria: CategoriaFinanceira) => {
    setEditingCategoria(categoria)
    setNome(categoria.nome)
    setEscopo(categoria.escopo)
    setDialogOpen(true)
  }

  const openDeleteDialog = (categoria: CategoriaFinanceira) => {
    setDeletingCategoria(categoria)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      if (editingCategoria) {
        await fetch(`/api/admin/categorias-financeiras/${editingCategoria.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, escopo }),
        })
      } else {
        await fetch('/api/admin/categorias-financeiras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, escopo }),
        })
      }

      mutate('/api/admin/categorias-financeiras')
      setDialogOpen(false)
      setEditingCategoria(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCategoria) return
    setIsSubmitting(true)

    try {
      await fetch(`/api/admin/categorias-financeiras/${deletingCategoria.id}`, {
        method: 'DELETE',
      })
      mutate('/api/admin/categorias-financeiras')
      setDeleteDialogOpen(false)
      setDeletingCategoria(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border bg-[linear-gradient(135deg,rgba(71,125,232,0.12),rgba(34,199,183,0.08)_45%,rgba(244,183,64,0.12))] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Landmark className="h-7 w-7 text-primary" />
              Categorias financeiras
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Centralize as categorias usadas no financeiro e defina se cada uma serve para contas a pagar, a receber ou para os dois fluxos.
            </p>
          </div>
          <Button onClick={openNewDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria financeira
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total</p><p className="mt-1 text-3xl font-bold">{resumo.total}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">So pagar</p><p className="mt-1 text-3xl font-bold">{resumo.pagar}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">So receber</p><p className="mt-1 text-3xl font-bold">{resumo.receber}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Ambos</p><p className="mt-1 text-3xl font-bold">{resumo.ambos}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastro financeiro</CardTitle>
          <CardDescription>As contas antigas continuam legíveis. As novas entram com categoria estruturada para evitar texto solto.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : categorias?.length ? (
            <div className="space-y-3">
              {categorias.map((categoria, index) => {
                const ScopeIcon = scopeIcons[categoria.escopo]

                return (
                  <div key={categoria.id} className="rounded-2xl border bg-card/95 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl border bg-primary/8 p-3 text-primary">
                          <ScopeIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{categoria.nome}</p>
                            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">#{index + 1}</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{scopeLabels[categoria.escopo]}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(categoria)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(categoria)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <Tags className="mx-auto mb-3 h-10 w-10 text-primary/50" />
              <p className="font-medium">Nenhuma categoria financeira cadastrada</p>
              <p className="mt-1 text-sm text-muted-foreground">Crie as categorias do financeiro para parar de depender de texto aberto nos lancamentos.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategoria ? 'Editar categoria financeira' : 'Nova categoria financeira'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome-financeiro">Nome</Label>
              <Input id="nome-financeiro" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex: Embalagens, Taxas, Delivery..." required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Uso no financeiro</Label>
              <Select value={escopo} onValueChange={(value) => setEscopo(value as EscopoCategoriaFinanceira)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o uso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAGAR">Contas a pagar</SelectItem>
                  <SelectItem value="RECEBER">Contas a receber</SelectItem>
                  <SelectItem value="AMBOS">Pagar e receber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !nome.trim()}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {editingCategoria ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir categoria financeira?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Tem certeza que deseja excluir &quot;{deletingCategoria?.nome}&quot;?</p>
            <p>As contas antigas preservam o nome salvo, mas novos lancamentos deixam de poder selecionar esta categoria.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
