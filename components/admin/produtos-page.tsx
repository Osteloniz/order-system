'use client'

import React from "react"

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Plus, Pencil, Trash2, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { formatarMoeda } from '@/lib/calc'
import type { Produto, Categoria } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface ProdutoComCategoria extends Produto {
  categoriaNome: string
}

export function ProdutosPage() {
  const { data: produtos, isLoading: loadingProdutos } = useSWR<ProdutoComCategoria[]>(
    '/api/admin/produtos',
    fetcher
  )
  const { data: categorias } = useSWR<Categoria[]>('/api/admin/categorias', fetcher)
  
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null)
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoriaId: '',
    preco: '',
    imagensText: '',
    ativo: true
  })

  const openNewDialog = () => {
    setEditingProduto(null)
    setFormData({ nome: '', descricao: '', categoriaId: '', preco: '', imagensText: '', ativo: true })
    setDialogOpen(true)
  }

  const openEditDialog = (produto: Produto) => {
    const imagens = produto.imagens?.length
      ? produto.imagens
      : produto.imagemUrl
        ? [produto.imagemUrl]
        : []
    setEditingProduto(produto)
    setFormData({
      nome: produto.nome,
      descricao: produto.descricao || '',
      categoriaId: produto.categoriaId,
      preco: (produto.preco / 100).toFixed(2).replace('.', ','),
      imagensText: imagens.join('\n'),
      ativo: produto.ativo
    })
    setDialogOpen(true)
  }

  const openDeleteDialog = (produto: Produto) => {
    setDeletingProduto(produto)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const precoNumero = Number.parseFloat(formData.preco.replace(',', '.')) * 100
    const imagens = formData.imagensText
      .split('\n')
      .map(url => url.trim())
      .filter(Boolean)

    try {
      if (editingProduto) {
        await fetch(`/api/admin/produtos/${editingProduto.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: formData.nome,
            descricao: formData.descricao,
            categoriaId: formData.categoriaId,
            preco: precoNumero,
            imagens,
            ativo: formData.ativo
          })
        })
      } else {
        await fetch('/api/admin/produtos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: formData.nome,
            descricao: formData.descricao,
            categoriaId: formData.categoriaId,
            preco: precoNumero,
            imagens,
            ativo: formData.ativo
          })
        })
      }
      mutate('/api/admin/produtos')
      setDialogOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProduto) return
    setIsSubmitting(true)
    
    try {
      await fetch(`/api/admin/produtos/${deletingProduto.id}`, {
        method: 'DELETE'
      })
      mutate('/api/admin/produtos')
      setDeleteDialogOpen(false)
      setDeletingProduto(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleAtivo = async (produto: Produto) => {
    await fetch(`/api/admin/produtos/${produto.id}/ativo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !produto.ativo })
    })
    mutate('/api/admin/produtos')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produtos</h1>
        <Button onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      {loadingProdutos ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : produtos?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum produto cadastrado</p>
            <Button variant="outline" className="mt-4 bg-transparent" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeiro produto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {produtos?.map(produto => (
            <Card key={produto.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{produto.nome}</h3>
                      <Badge variant="outline" className="text-xs">
                        {produto.categoriaNome}
                      </Badge>
                      {!produto.ativo && (
                        <Badge variant="secondary" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {produto.descricao && (
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {produto.descricao}
                      </p>
                    )}
                    <p className="text-primary font-bold mt-1">
                      {formatarMoeda(produto.preco)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={produto.ativo}
                      onCheckedChange={() => handleToggleAtivo(produto)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(produto)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(produto)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduto ? 'Editar Produto' : 'Novo Produto'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={e => setFormData(p => ({ ...p, descricao: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select
                value={formData.categoriaId}
                onValueChange={value => setFormData(p => ({ ...p, categoriaId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preco">Preço (R$)</Label>
              <Input
                id="preco"
                value={formData.preco}
                onChange={e => setFormData(p => ({ ...p, preco: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagens">Imagens (URLs, uma por linha)</Label>
              <Textarea
                id="imagens"
                value={formData.imagensText}
                onChange={e => setFormData(p => ({ ...p, imagensText: e.target.value }))}
                placeholder="https://exemplo.com/imagem-1.jpg&#10;https://exemplo.com/imagem-2.jpg"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={checked => setFormData(p => ({ ...p, ativo: checked }))}
              />
              <Label htmlFor="ativo">Produto ativo</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingProduto ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deletingProduto?.nome}&quot;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
