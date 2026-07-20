'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  BadgePercent,
  Pencil,
  Power,
  Save,
  Search,
  Trash2,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda } from '@/lib/calc'
import { formatCouponExpiryDateInput, formatCouponExpiryLabel } from '@/lib/coupon-expiry'
import type { Cupom, TipoCupom } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar cupons')
  return data
}

export function CuponsPage() {
  const { data: cupons, isLoading } = useSWR<Cupom[]>('/api/admin/cupons', fetcher, {
    refreshInterval: 15000,
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<TipoCupom>('FIXO')
  const [valor, setValor] = useState('')
  const [maxUsos, setMaxUsos] = useState('1')
  const [expiraEm, setExpiraEm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS')
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!editingId || !cupons) return
    const cupom = cupons.find((item) => item.id === editingId)
    if (!cupom) return

    setCodigo(cupom.codigo)
    setTipo(cupom.tipo)
    setValor(cupom.tipo === 'FIXO' ? (cupom.valor / 100).toFixed(2).replace('.', ',') : String(cupom.valor))
    setMaxUsos(String(cupom.maxUsos))
    setExpiraEm(formatCouponExpiryDateInput(cupom.expiraEm))
  }, [editingId, cupons])

  const cuponsFiltrados = useMemo(() => {
    const lista = cupons ?? []
    const busca = search.trim().toLowerCase()
    return lista.filter((cupom) => {
      if (statusFilter === 'ATIVOS' && !cupom.ativo) return false
      if (statusFilter === 'INATIVOS' && cupom.ativo) return false
      if (!busca) return true
      return `${cupom.codigo} ${cupom.tipo}`.toLowerCase().includes(busca)
    })
  }, [cupons, search, statusFilter])

  const resumo = useMemo(() => {
    const lista = cupons ?? []
    return {
      total: lista.length,
      ativos: lista.filter((cupom) => cupom.ativo).length,
      inativos: lista.filter((cupom) => !cupom.ativo).length,
      usados: lista.reduce((acc, cupom) => acc + cupom.usos, 0),
    }
  }, [cupons])

  const resetForm = () => {
    setEditingId(null)
    setCodigo('')
    setTipo('FIXO')
    setValor('')
    setMaxUsos('1')
    setExpiraEm('')
    setError('')
  }

  const parseValor = () => {
    if (tipo === 'FIXO') {
      return Math.round(Number.parseFloat(valor.replace(',', '.')) * 100)
    }
    return Math.round(Number.parseFloat(valor.replace(',', '.')))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setIsSaving(true)

    const valorNumero = parseValor()
    const maxUsosNumero = Number.parseInt(maxUsos, 10)

    if (!codigo.trim()) {
      setError('Informe o codigo')
      setIsSaving(false)
      return
    }
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setError('Valor invalido')
      setIsSaving(false)
      return
    }
    if (!Number.isFinite(maxUsosNumero) || maxUsosNumero <= 0) {
      setError('Limite de usos invalido')
      setIsSaving(false)
      return
    }
    try {
      const payload = {
        codigo: codigo.trim().toUpperCase(),
        tipo,
        valor: valorNumero,
        maxUsos: maxUsosNumero,
        expiraEm: expiraEm || null,
      }

      const url = editingId ? `/api/admin/cupons/${editingId}` : '/api/admin/cupons'
      const method = editingId ? 'PUT' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao salvar cupom')
      }

      await mutate('/api/admin/cupons')
      setMessage(editingId ? 'Cupom atualizado com sucesso.' : 'Cupom criado com sucesso.')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cupom')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleAtivo = async (cupom: Cupom) => {
    setMessage('')
    const response = await fetch(`/api/admin/cupons/${cupom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !cupom.ativo }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setError(data.error || 'Erro ao atualizar status do cupom')
      return
    }
    await mutate('/api/admin/cupons')
    setMessage(cupom.ativo ? `Cupom ${cupom.codigo} desativado.` : `Cupom ${cupom.codigo} ativado.`)
  }

  const handleDelete = async (cupom: Cupom) => {
    setDeletingId(cupom.id)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/admin/cupons/${cupom.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir cupom')
      }
      await mutate('/api/admin/cupons')
      if (editingId === cupom.id) resetForm()
      setMessage(`Cupom ${cupom.codigo} excluido com sucesso.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir cupom')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BadgePercent className="h-3.5 w-3.5" />
              Promocoes e campanhas
            </div>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <BadgePercent className="h-7 w-7 text-primary" />
              Cupons
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Centralize campanhas, validade e limite de uso sem perder o controle do que esta ativo no checkout.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
              <p className="text-xs text-muted-foreground">Usos totais</p>
              <p className="mt-1 text-2xl font-bold">{resumo.usados}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="max-w-2xl border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>{editingId ? 'Editar cupom' : 'Novo cupom'}</CardTitle>
          </CardHeader>
          <CardContent>
            {message ? (
              <p className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                {message}
              </p>
            ) : null}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Codigo</Label>
                  <Input
                    id="codigo"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="PROMO10"
                    className="h-11 rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={(value) => setTipo(value as TipoCupom)}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXO">Valor fixo (R$)</SelectItem>
                      <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valor">{tipo === 'FIXO' ? 'Valor (R$)' : 'Percentual (%)'}</Label>
                  <Input
                    id="valor"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder={tipo === 'FIXO' ? '10,00' : '10'}
                    className="h-11 rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUsos">Limite de usos</Label>
                  <Input
                    id="maxUsos"
                    value={maxUsos}
                    onChange={(e) => setMaxUsos(e.target.value)}
                    placeholder="100"
                    className="h-11 rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="expiraEm">Expira em</Label>
                  <Input
                    id="expiraEm"
                    type="date"
                    value={expiraEm}
                    onChange={(e) => setExpiraEm(e.target.value)}
                    className="h-11 rounded-2xl"
                  />
                  <p className="text-xs text-muted-foreground">Opcional. Se deixar em branco, o cupom ficara sem expiracao.</p>
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="h-11 rounded-2xl" disabled={isSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {editingId ? 'Salvar alteracoes' : 'Criar cupom'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={resetForm}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Cupons cadastrados</CardTitle>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por codigo"
                    className="h-11 rounded-2xl pl-9"
                  />
                </div>
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
              <span>{cuponsFiltrados.length} cupom(ns) visivel(is)</span>
              <span className="hidden sm:inline">-</span>
              <span>Use a lista para editar, ativar ou remover campanhas</span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : null}
            {!isLoading && (!cupons || cupons.length === 0) ? (
              <p className="text-muted-foreground">Nenhum cupom cadastrado</p>
            ) : null}
            {cuponsFiltrados.map((cupom) => (
              <div key={cupom.id} className="rounded-[22px] border border-border/70 bg-background/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{cupom.codigo}</p>
                      <Badge variant="outline">{cupom.tipo === 'FIXO' ? 'Valor fixo' : 'Percentual'}</Badge>
                      {!cupom.ativo ? (
                        <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15" variant="outline">
                          Inativo
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Desconto</p>
                        <p className="mt-1 font-semibold">
                          {cupom.tipo === 'FIXO' ? formatarMoeda(cupom.valor) : `${cupom.valor}%`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Usos</p>
                        <p className="mt-1 font-semibold">
                          {cupom.usos}/{cupom.maxUsos}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Expira em</p>
                        <p className="mt-1 font-semibold">
                          {formatCouponExpiryLabel(cupom.expiraEm)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:min-w-[220px]">
                    <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => handleToggleAtivo(cupom)}>
                      <Power className="mr-2 h-4 w-4" />
                      {cupom.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setEditingId(cupom.id)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="h-11 rounded-2xl">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] rounded-[1.4rem] sm:max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir cupom {cupom.codigo}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acao remove o cupom definitivamente. Se ele ainda estiver sendo usado internamente, nao podera mais ser aplicado em novos pedidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                          <p>Tipo: {cupom.tipo === 'FIXO' ? 'Valor fixo' : 'Percentual'}</p>
                          <p>Desconto: {cupom.tipo === 'FIXO' ? formatarMoeda(cupom.valor) : `${cupom.valor}%`}</p>
                          <p>Usos: {cupom.usos}/{cupom.maxUsos}</p>
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(cupom)}
                            disabled={deletingId === cupom.id}
                            className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletingId === cupom.id ? 'Excluindo...' : 'Confirmar exclusao'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
