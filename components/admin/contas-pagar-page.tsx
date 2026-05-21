'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CalendarClock, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarMoeda } from '@/lib/calc'
import { statusContaPagarLabels, statusContaPagarStyles } from '@/lib/finance'
import { formatDateInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'
import type { CategoriaFinanceira, ContaPagar, StatusContaPagar } from '@/lib/types'

type ContasPagarData = {
  from: string
  to: string
  status: 'TODOS' | StatusContaPagar
  totalRegistros: number
  resumo: {
    total: number
    pendente: number
    pago: number
    cancelado: number
  }
  contas: ContaPagar[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar contas a pagar')
  return data
}

function parseCurrencyToCents(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

function formatCurrencyInput(value: string) {
  const cents = parseCurrencyToCents(value)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

type FormState = {
  descricao: string
  categoriaFinanceiraId: string
  fornecedor: string
  observacoes: string
  valor: string
  vencimento: string
  status: StatusContaPagar
}

export function ContasPagarPage() {
  const today = todayInSaoPaulo()
  const [fromInput, setFromInput] = useState(today)
  const [toInput, setToInput] = useState(today)
  const [statusInput, setStatusInput] = useState<'TODOS' | StatusContaPagar>('TODOS')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<'TODOS' | StatusContaPagar>('TODOS')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ContaPagar | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({ descricao: '', categoriaFinanceiraId: '', fornecedor: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })

  const periodoPendente = from !== fromInput || to !== toInput || status !== statusInput
  const url = useMemo(() => `/api/admin/financeiro/contas-pagar?from=${from}&to=${to}&status=${status}`, [from, to, status])
  const { data, isLoading, mutate } = useSWR<ContasPagarData>(url, fetcher)
  const { data: categoriasFinanceiras } = useSWR<CategoriaFinanceira[]>('/api/admin/categorias-financeiras?escopo=PAGAR', fetcher)

  useEffect(() => {
    if (!selected) return
    setForm({
      descricao: selected.descricao,
      categoriaFinanceiraId: selected.categoriaFinanceiraId || '',
      fornecedor: selected.fornecedor || '',
      observacoes: selected.observacoes || '',
      valor: formatCurrencyInput(String(selected.valor)),
      vencimento: todayInSaoPaulo() > selected.vencimento.slice(0, 10) ? selected.vencimento.slice(0, 10) : selected.vencimento.slice(0, 10),
      status: selected.status,
    })
  }, [selected])

  const contasFiltradas = useMemo(() => {
    const busca = search.trim().toLowerCase()
    return (data?.contas ?? []).filter((conta) => {
      if (!busca) return true
      const texto = [conta.descricao, conta.categoria, conta.fornecedor, conta.observacoes].filter(Boolean).join(' ').toLowerCase()
      return texto.includes(busca)
    })
  }, [data?.contas, search])

  const iniciarNovaConta = () => {
    setSelected(null)
    setIsCreating(true)
    setFormOpen(true)
    setMessage('')
    setForm({ descricao: '', categoriaFinanceiraId: '', fornecedor: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })
  }

  const abrirEdicao = (conta: ContaPagar) => {
    setSelected(conta)
    setIsCreating(false)
    setFormOpen(true)
    setMessage('')
  }

  const resetarFormulario = () => {
    setSelected(null)
    setIsCreating(false)
    setFormOpen(false)
    setForm({ descricao: '', categoriaFinanceiraId: '', fornecedor: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })
  }

  const aplicarFiltros = () => {
    setFrom(fromInput)
    setTo(toInput)
    setStatus(statusInput)
  }

  const salvarConta = async () => {
    setSaving(true)
    setMessage('')
    try {
      const body = {
        descricao: form.descricao,
        categoriaFinanceiraId: form.categoriaFinanceiraId || undefined,
        fornecedor: form.fornecedor || undefined,
        observacoes: form.observacoes || undefined,
        valor: parseCurrencyToCents(form.valor),
        vencimento: `${form.vencimento}T12:00:00-03:00`,
        status: form.status,
      }

      const response = await fetch(isCreating ? '/api/admin/financeiro/contas-pagar' : `/api/admin/financeiro/contas-pagar/${selected?.id}`, {
        method: isCreating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar conta')
      setMessage(isCreating ? 'Conta cadastrada.' : 'Conta atualizada.')
      setSelected(data)
      setIsCreating(false)
      setFormOpen(false)
      await mutate()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar conta')
    } finally {
      setSaving(false)
    }
  }

  const excluirConta = async (id: string) => {
    const confirmed = window.confirm('Excluir esta conta a pagar?')
    if (!confirmed) return
    const response = await fetch(`/api/admin/financeiro/contas-pagar/${id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || 'Erro ao excluir conta')
      return
    }
    if (selected?.id === id) {
      setSelected(null)
      setIsCreating(false)
      setFormOpen(false)
    }
    setMessage('Conta excluida.')
    await mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="h-6 w-6 text-primary" />Contas a pagar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre custos, vencimentos e acompanhe o que esta pendente ou ja foi pago.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={iniciarNovaConta}><Plus className="mr-2 h-4 w-4" />Nova conta</Button>
          <Button variant="outline" onClick={() => mutate()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pendente</p><p className="mt-1 text-3xl font-bold">{formatarMoeda(data?.resumo.pendente ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pago</p><p className="mt-1 text-3xl font-bold">{formatarMoeda(data?.resumo.pago ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cancelado</p><p className="mt-1 text-3xl font-bold">{formatarMoeda(data?.resumo.cancelado ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total do periodo</p><p className="mt-1 text-3xl font-bold">{formatarMoeda(data?.resumo.total ?? 0)}</p></CardContent></Card>
      </div>

      <Card>
          <CardHeader className="space-y-4">
            <CardTitle>Lista de contas</CardTitle>
            <div className="grid gap-3 lg:grid-cols-[180px_180px_180px_minmax(0,1fr)_auto]">
              <div className="space-y-2"><Label>De</Label><Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} /></div>
              <div className="space-y-2"><Label>Ate</Label><Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusInput} onValueChange={(value) => setStatusInput(value as 'TODOS' | StatusContaPagar)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Descricao, categoria ou fornecedor" />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={aplicarFiltros} disabled={!periodoPendente}><Search className="mr-2 h-4 w-4" />Buscar</Button>
                <Button variant="outline" onClick={periodoPendente ? () => { setFromInput(today); setToInput(today); setStatusInput('TODOS'); setFrom(today); setTo(today); setStatus('TODOS') } : () => mutate()}><RefreshCw className="mr-2 h-4 w-4" />{periodoPendente ? 'Limpar' : 'Atualizar'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            ) : contasFiltradas.length ? (
              <div className="space-y-3">
                {contasFiltradas.map((conta) => (
                  <div key={conta.id} className={`rounded-xl border p-4 ${selected?.id === conta.id ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold">{conta.descricao}</p>
                        <p className="text-sm text-muted-foreground">
                          {conta.categoria || 'Sem categoria'}{conta.fornecedor ? ` • ${conta.fornecedor}` : ''}
                        </p>
                        <p className="text-sm text-muted-foreground">Vence em {formatDateInSaoPaulo(conta.vencimento)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusContaPagarStyles[conta.status]} variant="outline">{statusContaPagarLabels[conta.status]}</Badge>
                        <Badge>{formatarMoeda(conta.valor)}</Badge>
                      </div>
                    </div>
                    {conta.observacoes && <p className="mt-3 text-sm text-muted-foreground">{conta.observacoes}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirEdicao(conta)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => excluirConta(conta.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada no periodo selecionado.</div>
            )}
          </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open && !saving) {
            resetarFormulario()
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto p-3 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Nova conta a pagar' : 'Editar conta a pagar'}</DialogTitle>
            <DialogDescription>
              Cadastre o custo, vencimento e status sem poluir a tela principal. A lista continua focada em consulta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Ex: Embalagens, fornecedor, motoboy..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoria financeira</Label>
                <Select value={form.categoriaFinanceiraId || '__NONE__'} onValueChange={(value) => setForm((current) => ({ ...current, categoriaFinanceiraId: value === '__NONE__' ? '' : value }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Sem categoria</SelectItem>
                    {categoriasFinanceiras?.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.categoriaFinanceiraId && selected?.categoria ? (
                  <p className="text-xs text-muted-foreground">Lancamento antigo: categoria salva como &quot;{selected.categoria}&quot;.</p>
                ) : null}
              </div>
              <div className="space-y-2"><Label>Fornecedor</Label><Input value={form.fornecedor} onChange={(event) => setForm((current) => ({ ...current, fornecedor: event.target.value }))} placeholder="Ex: Atacado X" /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Valor</Label><Input value={form.valor} onChange={(event) => setForm((current) => ({ ...current, valor: formatCurrencyInput(event.target.value) }))} placeholder="R$ 0,00" /></div>
              <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as StatusContaPagar }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Observacoes</Label><Input value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Detalhes internos da conta" /></div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={resetarFormulario}>Cancelar</Button>
            <Button type="button" onClick={salvarConta} disabled={saving}>
              {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isCreating ? 'Cadastrar conta' : 'Salvar alteracoes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
