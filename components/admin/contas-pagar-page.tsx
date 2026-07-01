'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CalendarClock, Clock3, Pencil, Plus, ReceiptText, RefreshCw, Save, Search, Tag, Trash2, WalletCards } from 'lucide-react'
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
import { formatDateInSaoPaulo, getCurrentMonthRangeInSaoPaulo, todayInSaoPaulo } from '@/lib/sao-paulo'
import type { CategoriaFinanceira, ContaPagar, FornecedorFinanceiro, StatusContaPagar } from '@/lib/types'

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

function normalizeDate(value: string) {
  return value.slice(0, 10)
}

function getFornecedorLabel(conta: Pick<ContaPagar, 'fornecedorFinanceiroNome' | 'fornecedor'>) {
  return conta.fornecedorFinanceiroNome || conta.fornecedor || ''
}

function getDueState(vencimento: string, status: StatusContaPagar, today: string) {
  if (status !== 'PENDENTE') {
    return {
      label: status === 'PAGO' ? 'Pago' : 'Cancelado',
      tone: 'text-muted-foreground',
    }
  }

  const dueDate = normalizeDate(vencimento)

  if (dueDate < today) {
    return {
      label: 'Em atraso',
      tone: 'text-destructive',
    }
  }

  if (dueDate === today) {
    return {
      label: 'Vence hoje',
      tone: 'text-warning-foreground',
    }
  }

  return {
    label: 'No prazo',
    tone: 'text-success',
  }
}

type FormState = {
  descricao: string
  categoriaFinanceiraId: string
  fornecedorFinanceiroId: string
  observacoes: string
  valor: string
  vencimento: string
  status: StatusContaPagar
}

export function ContasPagarPage() {
  const today = todayInSaoPaulo()
  const defaultRange = getCurrentMonthRangeInSaoPaulo()
  const [fromInput, setFromInput] = useState(defaultRange.from)
  const [toInput, setToInput] = useState(defaultRange.to)
  const [statusInput, setStatusInput] = useState<'TODOS' | StatusContaPagar>('TODOS')
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [status, setStatus] = useState<'TODOS' | StatusContaPagar>('TODOS')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ContaPagar | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [fornecedorModalOpen, setFornecedorModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [creatingFornecedor, setCreatingFornecedor] = useState(false)
  const [novoFornecedorNome, setNovoFornecedorNome] = useState('')
  const [form, setForm] = useState<FormState>({ descricao: '', categoriaFinanceiraId: '', fornecedorFinanceiroId: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })

  const periodoPendente = from !== fromInput || to !== toInput || status !== statusInput
  const url = useMemo(() => `/api/admin/financeiro/contas-pagar?from=${from}&to=${to}&status=${status}`, [from, to, status])
  const { data, isLoading, mutate } = useSWR<ContasPagarData>(url, fetcher)
  const { data: categoriasFinanceiras } = useSWR<CategoriaFinanceira[]>('/api/admin/categorias-financeiras?escopo=PAGAR', fetcher)
  const { data: fornecedoresFinanceiros, mutate: mutateFornecedores } = useSWR<FornecedorFinanceiro[]>('/api/admin/fornecedores-financeiros', fetcher)

  useEffect(() => {
    if (!selected) return
    setForm({
      descricao: selected.descricao,
      categoriaFinanceiraId: selected.categoriaFinanceiraId || '',
      fornecedorFinanceiroId: selected.fornecedorFinanceiroId || '',
      observacoes: selected.observacoes || '',
      valor: formatCurrencyInput(String(selected.valor)),
      vencimento: normalizeDate(selected.vencimento),
      status: selected.status,
    })
  }, [selected])

  const contasFiltradas = useMemo(() => {
    const busca = search.trim().toLowerCase()
    return (data?.contas ?? []).filter((conta) => {
      if (!busca) return true
      const texto = [conta.descricao, conta.categoria, getFornecedorLabel(conta), conta.observacoes].filter(Boolean).join(' ').toLowerCase()
      return texto.includes(busca)
    })
  }, [data?.contas, search])

  const resumoBusca = useMemo(
    () =>
      contasFiltradas.reduce(
        (acc, conta) => {
          acc.total += conta.valor
          acc.quantidade += 1

          if (conta.status === 'PENDENTE') acc.pendente += conta.valor
          if (conta.status === 'PAGO') acc.pago += conta.valor
          if (conta.status === 'CANCELADO') acc.cancelado += conta.valor

          return acc
        },
        { total: 0, pendente: 0, pago: 0, cancelado: 0, quantidade: 0 }
      ),
    [contasFiltradas]
  )

  const cardsResumo = [
    {
      titulo: 'Pendente',
      valor: formatarMoeda(data?.resumo.pendente ?? 0),
      detalhe: 'Compromissos ainda em aberto',
      icon: Clock3,
      tone: 'text-warning-foreground',
    },
    {
      titulo: 'Pago',
      valor: formatarMoeda(data?.resumo.pago ?? 0),
      detalhe: 'Contas ja liquidadas',
      icon: WalletCards,
      tone: 'text-success',
    },
    {
      titulo: 'Cancelado',
      valor: formatarMoeda(data?.resumo.cancelado ?? 0),
      detalhe: 'Lancamentos desconsiderados',
      icon: Trash2,
      tone: 'text-muted-foreground',
    },
    {
      titulo: 'Total do periodo',
      valor: formatarMoeda(data?.resumo.total ?? 0),
      detalhe: `${data?.totalRegistros ?? 0} conta(s) encontradas`,
      icon: ReceiptText,
      tone: 'text-primary',
    },
  ]

  const iniciarNovaConta = () => {
    setSelected(null)
    setIsCreating(true)
    setFormOpen(true)
    setFornecedorModalOpen(false)
    setMessage('')
    setNovoFornecedorNome('')
    setForm({ descricao: '', categoriaFinanceiraId: '', fornecedorFinanceiroId: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })
  }

  const abrirEdicao = (conta: ContaPagar) => {
    setSelected(conta)
    setIsCreating(false)
    setFormOpen(true)
    setFornecedorModalOpen(false)
    setNovoFornecedorNome('')
    setMessage('')
  }

  const resetarFormulario = () => {
    setSelected(null)
    setIsCreating(false)
    setFormOpen(false)
    setFornecedorModalOpen(false)
    setCreatingFornecedor(false)
    setNovoFornecedorNome('')
    setForm({ descricao: '', categoriaFinanceiraId: '', fornecedorFinanceiroId: '', observacoes: '', valor: '', vencimento: today, status: 'PENDENTE' })
  }

  const cadastrarFornecedorRapido = async () => {
    const nome = novoFornecedorNome.trim()
    if (!nome) {
      setMessage('Informe o nome do fornecedor para cadastrar.')
      return
    }

    setCreatingFornecedor(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/fornecedores-financeiros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      const fornecedor = await response.json()
      if (!response.ok) throw new Error(fornecedor.error || 'Erro ao cadastrar fornecedor')
      await mutateFornecedores()
      setForm((current) => ({ ...current, fornecedorFinanceiroId: fornecedor.id }))
      setNovoFornecedorNome('')
      setFornecedorModalOpen(false)
      setMessage('Fornecedor cadastrado e selecionado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao cadastrar fornecedor')
    } finally {
      setCreatingFornecedor(false)
    }
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
        fornecedorFinanceiroId: form.fornecedorFinanceiroId || undefined,
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
    <div className="space-y-6 overflow-x-hidden">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <CalendarClock className="h-3.5 w-3.5" />
              Saidas e vencimentos
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/82 text-primary shadow-sm shadow-primary/10">
                <CalendarClock className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Contas a pagar</h1>
                <p className="text-sm text-muted-foreground">
                  Centralize custos, vencimentos e status de pagamento com uma leitura mais clara do caixa que vai sair.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11 rounded-2xl" onClick={iniciarNovaConta}><Plus className="mr-2 h-4 w-4" />Nova conta</Button>
            <Button className="h-11 rounded-2xl" variant="outline" onClick={() => mutate()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          </div>
        </div>
      </section>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cardsResumo.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.titulo} className="border-border/70 bg-card/95">
                <CardContent className="p-5">
                  <Icon className={`mb-3 h-5 w-5 ${card.tone}`} />
                  <p className="text-sm text-muted-foreground">{card.titulo}</p>
                  <p className="mt-1 text-3xl font-bold">{card.valor}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.detalhe}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Lista de contas</CardTitle>
              <p className="text-sm text-muted-foreground">
                Filtre por periodo e status, e acompanhe rapidamente o total dos registros que estao na tela.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_160px_190px_minmax(320px,1fr)_auto_auto]">
              <div className="space-y-2">
                <Label>De</Label>
                <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="h-11 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label>Ate</Label>
                <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="h-11 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusInput} onValueChange={(value) => setStatusInput(value as 'TODOS' | StatusContaPagar)}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
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
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-2xl pl-9" placeholder="Descricao, categoria ou fornecedor" />
                </div>
              </div>
              <Button className="h-11 rounded-2xl xl:self-end" onClick={aplicarFiltros} disabled={!periodoPendente}>
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
              <Button
                className="h-11 rounded-2xl xl:self-end"
                variant="outline"
                onClick={periodoPendente ? () => { setFromInput(defaultRange.from); setToInput(defaultRange.to); setStatusInput('TODOS'); setFrom(defaultRange.from); setTo(defaultRange.to); setStatus('TODOS') } : () => mutate()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {periodoPendente ? 'Limpar' : 'Atualizar'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Total filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.total)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{resumoBusca.quantidade} conta(s) visiveis</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Pendente filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.pendente)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Titulos ainda em aberto</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Pago filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.pago)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Contas ja liquidadas</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Cancelado filtrado</p>
              <p className="mt-1 text-2xl font-bold">{formatarMoeda(resumoBusca.cancelado)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Lancamentos desconsiderados</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : contasFiltradas.length ? (
            <>
              <div className="hidden overflow-x-auto rounded-xl border lg:block">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="bg-muted/35 text-left text-muted-foreground">
                    <tr>
                      <th className="py-3 pl-4 pr-4 font-medium">Descricao</th>
                      <th className="py-3 pr-4 font-medium">Categoria</th>
                      <th className="py-3 pr-4 font-medium">Fornecedor</th>
                      <th className="py-3 pr-4 font-medium">Vencimento</th>
                      <th className="py-3 pr-4 font-medium">Situacao</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Valor</th>
                      <th className="py-3 pr-4 font-medium text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasFiltradas.map((conta) => {
                      const dueState = getDueState(conta.vencimento, conta.status, today)

                      return (
                        <tr key={conta.id} className={`border-t odd:bg-background even:bg-muted/15 ${selected?.id === conta.id ? 'bg-primary/5' : ''}`}>
                          <td className="py-3 pl-4 pr-4">
                            <div className="space-y-1">
                              <p className="font-semibold">{conta.descricao}</p>
                              {conta.observacoes ? <p className="max-w-[320px] truncate text-xs text-muted-foreground">{conta.observacoes}</p> : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4">{conta.categoria || 'Sem categoria'}</td>
                          <td className="py-3 pr-4">{getFornecedorLabel(conta) || '-'}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{formatDateInSaoPaulo(conta.vencimento)}</td>
                          <td className={`py-3 pr-4 font-medium ${dueState.tone}`}>{dueState.label}</td>
                          <td className="py-3 pr-4">
                            <Badge className={statusContaPagarStyles[conta.status]} variant="outline">{statusContaPagarLabels[conta.status]}</Badge>
                          </td>
                          <td className="py-3 pr-4 font-semibold">{formatarMoeda(conta.valor)}</td>
                          <td className="py-3 pl-4 pr-4">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => abrirEdicao(conta)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                              <Button size="sm" variant="destructive" onClick={() => excluirConta(conta.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {contasFiltradas.map((conta) => {
                  const dueState = getDueState(conta.vencimento, conta.status, today)

                  return (
                    <div key={conta.id} className={`rounded-[22px] border border-border/70 p-4 shadow-sm ${selected?.id === conta.id ? 'border-primary bg-primary/5' : 'bg-background/80'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{conta.descricao}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Tag className="h-3.5 w-3.5" />
                              {conta.categoria || 'Sem categoria'}
                            </span>
                            {getFornecedorLabel(conta) ? <span>{getFornecedorLabel(conta)}</span> : null}
                          </div>
                        </div>
                        <Badge className={statusContaPagarStyles[conta.status]} variant="outline">{statusContaPagarLabels[conta.status]}</Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-muted/25 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p>
                          <p className="mt-1 text-lg font-semibold">{formatarMoeda(conta.valor)}</p>
                        </div>
                        <div className="rounded-2xl bg-muted/25 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencimento</p>
                          <p className="mt-1 text-sm font-medium">{formatDateInSaoPaulo(conta.vencimento)}</p>
                        </div>
                        <div className="rounded-2xl bg-muted/25 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Situacao</p>
                          <p className={`mt-1 text-sm font-medium ${dueState.tone}`}>{dueState.label}</p>
                        </div>
                      </div>

                      {conta.observacoes ? <p className="mt-3 text-sm text-muted-foreground">{conta.observacoes}</p> : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" className="rounded-2xl" variant="outline" onClick={() => abrirEdicao(conta)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                        <Button size="sm" className="rounded-2xl" variant="destructive" onClick={() => excluirConta(conta.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
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
        <DialogContent className="max-h-[92vh] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] overflow-y-auto p-3 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Nova conta a pagar' : 'Editar conta a pagar'}</DialogTitle>
            <DialogDescription>
              Cadastre o custo, vencimento e status sem poluir a tela principal. A lista continua focada em consulta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Ex: Embalagens, fornecedor, motoboy..." className="h-11 rounded-2xl" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoria financeira</Label>
                <Select value={form.categoriaFinanceiraId || '__NONE__'} onValueChange={(value) => setForm((current) => ({ ...current, categoriaFinanceiraId: value === '__NONE__' ? '' : value }))}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
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

              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={form.fornecedorFinanceiroId || '__NONE__'} onValueChange={(value) => setForm((current) => ({ ...current, fornecedorFinanceiroId: value === '__NONE__' ? '' : value }))}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue placeholder="Selecione um fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Sem fornecedor</SelectItem>
                    {fornecedoresFinanceiros?.map((fornecedor) => (
                      <SelectItem key={fornecedor.id} value={fornecedor.id}>
                        {fornecedor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.fornecedorFinanceiroId && selected?.fornecedor && (
                  <p className="text-xs text-muted-foreground">Lancamento antigo: fornecedor salvo como &quot;{selected.fornecedor}&quot;.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Cadastro de fornecedor</p>
                  <p className="text-xs text-muted-foreground">Cadastre uma vez e reutilize o fornecedor nos proximos lancamentos e relatorios.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setFornecedorModalOpen(true)} className="h-11 w-full rounded-2xl sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo fornecedor
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2"><Label>Valor</Label><Input value={form.valor} onChange={(event) => setForm((current) => ({ ...current, valor: formatCurrencyInput(event.target.value) }))} placeholder="R$ 0,00" className="h-11 rounded-2xl" /></div>
              <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} className="h-11 rounded-2xl" /></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as StatusContaPagar }))}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden lg:block" />
            </div>
            <div className="space-y-2"><Label>Observacoes</Label><Input value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Detalhes internos da conta" className="h-11 rounded-2xl" /></div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" className="h-11 rounded-2xl" variant="outline" onClick={resetarFormulario}>Cancelar</Button>
            <Button type="button" className="h-11 rounded-2xl" onClick={salvarConta} disabled={saving}>
              {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isCreating ? 'Cadastrar conta' : 'Salvar alteracoes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={fornecedorModalOpen}
        onOpenChange={(open) => {
          setFornecedorModalOpen(open)
          if (!open && !creatingFornecedor) {
            setNovoFornecedorNome('')
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] p-3 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle>Novo fornecedor</DialogTitle>
            <DialogDescription>
              Cadastre apenas o nome. Fornecedores duplicados nao sao permitidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Nome do fornecedor</Label>
            <Input
              value={novoFornecedorNome}
              onChange={(event) => setNovoFornecedorNome(event.target.value)}
              placeholder="Ex: Atacado X"
              autoFocus
              className="h-11 rounded-2xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" className="h-11 rounded-2xl" variant="outline" onClick={() => setFornecedorModalOpen(false)} disabled={creatingFornecedor}>
              Cancelar
            </Button>
            <Button type="button" className="h-11 rounded-2xl" onClick={cadastrarFornecedorRapido} disabled={creatingFornecedor}>
              {creatingFornecedor ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar fornecedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
