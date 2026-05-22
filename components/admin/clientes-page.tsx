'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ClipboardList, Gift, MessageCircle, Phone, Plus, RefreshCw, Save, Search, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { formatPhoneInput, normalizePhone } from '@/lib/phone'
import { formatDateTimeInSaoPaulo } from '@/lib/sao-paulo'
import type { Cliente } from '@/lib/types'

type ClienteListItem = Omit<Cliente, 'pedidos'> & {
  totalPedidos: number
  ultimoPedidoEm?: string | null
}

type ClienteDetalhe = Cliente & {
  totalPedidos: number
  ultimoPedidoEm?: string | null
  resumoConsumo: {
    totalCookies: number
    sabores: { nome: string; quantidade: number }[]
  }
  resumoFidelidade: {
    totalMimosGerados: number
    mimosEntregues: number
    mimosDisponiveis: number
    progressoAtual: number
    faltamParaProximo: number
  }
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar clientes')
  return data
}

export function ClientesPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    whatsapp: '',
    clienteBloco: '',
    clienteApartamento: '',
    observacoes: '',
  })
  const [saving, setSaving] = useState(false)
  const [deliveringMimo, setDeliveringMimo] = useState(false)
  const [message, setMessage] = useState('')
  const url = useMemo(() => `/api/admin/clientes?search=${encodeURIComponent(search)}`, [search])
  const { data: clientes, isLoading, mutate } = useSWR<ClienteListItem[]>(url, fetcher, { refreshInterval: 15000 })
  const { data: selected, mutate: mutateSelected } = useSWR<ClienteDetalhe>(
    selectedId && !isCreating ? `/api/admin/clientes/${selectedId}` : null,
    fetcher
  )

  const totalClientes = clientes?.length ?? 0
  const totalPedidosCliente = selected?.totalPedidos ?? 0
  const ultimoPedido = selected?.pedidos?.[0] ?? null
  const totalCookiesCliente = selected?.resumoConsumo.totalCookies ?? 0
  const saboresFavoritos = selected?.resumoConsumo.sabores.slice(0, 4) ?? []
  const fidelidade = selected?.resumoFidelidade
  const progressoFidelidade = fidelidade?.progressoAtual ?? 0
  const faltamParaMimo = fidelidade?.faltamParaProximo ?? 10

  const marcarMimoEntregue = async () => {
    if (!selected) return
    setDeliveringMimo(true)
    setMessage('')
    try {
      const response = await fetch(`/api/admin/clientes/${selected.id}/mimo`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao registrar mimo entregue')
      mutateSelected(data, false)
      await mutate()
      setMessage('Mimo entregue registrado com sucesso.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao registrar mimo entregue')
    } finally {
      setDeliveringMimo(false)
    }
  }

  useEffect(() => {
    if (!selected) return
    setForm({
      nome: selected.nome || '',
      telefone: selected.telefone || '',
      whatsapp: selected.whatsapp || selected.telefone || '',
      clienteBloco: selected.clienteBloco || '',
      clienteApartamento: selected.clienteApartamento || '',
      observacoes: selected.observacoes || '',
    })
  }, [selected])

  const startNewCliente = () => {
    setSelectedId(null)
    setIsCreating(true)
    setMessage('')
    setForm({ nome: '', telefone: '', whatsapp: '', clienteBloco: '', clienteApartamento: '', observacoes: '' })
  }

  const selectCliente = (cliente: ClienteListItem) => {
    setSelectedId(cliente.id)
    setIsCreating(false)
    setMessage('')
  }

  const resetForm = () => {
    setForm({ nome: '', telefone: '', whatsapp: '', clienteBloco: '', clienteApartamento: '', observacoes: '' })
  }

  const saveCliente = async () => {
    if (!isCreating && !selected) return
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(isCreating ? '/api/admin/clientes' : `/api/admin/clientes/${selected?.id}`, {
        method: isCreating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          ...(isCreating ? { telefone: normalizePhone(form.telefone) } : {}),
          whatsapp: normalizePhone(form.whatsapp),
          clienteBloco: form.clienteBloco || undefined,
          clienteApartamento: form.clienteApartamento || undefined,
          observacoes: form.observacoes || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar cliente')
      setSelectedId(data.id)
      mutateSelected(data, false)
      setIsCreating(false)
      setMessage(isCreating ? 'Cliente cadastrado.' : 'Cliente atualizado.')
      await mutate()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="overflow-hidden rounded-3xl border bg-[linear-gradient(135deg,rgba(71,125,232,0.12),rgba(34,199,183,0.08)_45%,rgba(244,183,64,0.12))] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <UserRound className="h-7 w-7 text-primary" />
              Clientes
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Centralize WhatsApp, endereco no Paulistano, observacoes importantes e historico de compra para atendimento mais rapido.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-2xl border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">Clientes na busca</p>
              <p className="mt-1 text-2xl font-bold">{totalClientes}</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">Cookies do selecionado</p>
              <p className="mt-1 text-2xl font-bold">{totalCookiesCliente}</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-background/80 p-4 sm:col-span-2 xl:col-span-1">
              <p className="text-xs text-muted-foreground">Ultimo pedido</p>
              <p className="mt-1 break-words text-sm font-semibold">{ultimoPedido ? formatDateTimeInSaoPaulo(ultimoPedido.criadoEm) : 'Sem historico'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="text-sm text-muted-foreground">
          Busque, selecione e atualize os dados sem sair da tela.
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="w-full sm:w-auto" onClick={startNewCliente}>
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card className="min-w-0 border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle>Buscar cliente</CardTitle>
            <CardDescription>Encontre por nome, telefone ou WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou telefone" className="pl-9" />
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
              {totalClientes} cliente(s) carregado(s)
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </>
              ) : clientes?.length ? (
                clientes.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => selectCliente(cliente)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 ${selected?.id === cliente.id ? 'border-primary bg-primary/10 shadow-sm' : 'bg-card/90'}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{cliente.nome}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatarTelefone(cliente.telefone)}</span>
                          <span>-</span>
                          <span>{cliente.totalPedidos} pedido(s)</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="w-fit shrink-0">{cliente.clienteBloco || 'Sem bloco'}</Badge>
                    </div>
                    {cliente.observacoes ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{cliente.observacoes}</p> : null}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selected || isCreating ? (
          <div className="min-w-0 space-y-4">
            <Card className="min-w-0 border-border/70 bg-card/95">
              <CardHeader className="pb-3">
                <CardTitle>{isCreating ? 'Cadastrar cliente' : 'Editar cliente'}</CardTitle>
                <CardDescription>
                  {isCreating
                    ? 'Preencha os dados para criar um novo cadastro.'
                    : 'Atualize nome, contato, localizacao no Paulistano e anotacoes de atendimento.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isCreating && selected ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          Telefone
                        </div>
                        <p className="mt-1 break-words font-semibold">{formatarTelefone(selected.telefone)}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </div>
                        <p className="mt-1 break-words font-semibold">{formatarTelefone(selected.whatsapp)}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ClipboardList className="h-3.5 w-3.5" />
                          Pedidos
                        </div>
                        <p className="mt-1 text-2xl font-bold">{selected.totalPedidos}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ClipboardList className="h-3.5 w-3.5" />
                          Cookies comprados
                        </div>
                        <p className="mt-1 text-2xl font-bold">{selected.resumoConsumo.totalCookies}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <p className="text-sm font-medium">Fidelidade em andamento</p>
                        <p className="mt-1 text-2xl font-bold">{progressoFidelidade}/10</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fidelidade?.mimosDisponiveis
                            ? `${fidelidade.mimosDisponiveis} mimo(s) disponivel(is) para entregar agora.`
                            : `Faltam ${faltamParaMimo} cookie(s) para o proximo mimo.`}
                        </p>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                          <div className="rounded-lg border bg-background/70 p-2">
                            <span className="block">Mimos gerados</span>
                            <strong className="text-foreground">{fidelidade?.totalMimosGerados ?? 0}</strong>
                          </div>
                          <div className="rounded-lg border bg-background/70 p-2">
                            <span className="block">Mimos entregues</span>
                            <strong className="text-foreground">{fidelidade?.mimosEntregues ?? 0}</strong>
                          </div>
                          <div className="rounded-lg border bg-background/70 p-2">
                            <span className="block">Disponiveis</span>
                            <strong className="text-foreground">{fidelidade?.mimosDisponiveis ?? 0}</strong>
                          </div>
                        </div>
                        <Button
                          className="mt-3 w-full sm:w-auto"
                          onClick={marcarMimoEntregue}
                          disabled={deliveringMimo || !fidelidade?.mimosDisponiveis}
                          variant={fidelidade?.mimosDisponiveis ? 'default' : 'outline'}
                        >
                          {deliveringMimo ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
                          Marcar mimo entregue
                        </Button>
                      </div>
                      <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <p className="text-sm font-medium">Sabores mais comprados</p>
                        {saboresFavoritos.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {saboresFavoritos.map((sabor) => (
                              <Badge key={sabor.nome} variant="outline" className="max-w-full whitespace-normal break-words text-left">
                                {sabor.nome} - {sabor.quantidade}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Ainda nao ha sabores registrados neste cadastro.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nome</Label>
                    <Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: formatPhoneInput(event.target.value) }))} disabled={!isCreating} placeholder="(47) 99999-9999 ou +47..." />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: formatPhoneInput(event.target.value) }))} placeholder="(47) 99999-9999 ou +47..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Bloco</Label>
                    <Input value={form.clienteBloco} onChange={(event) => setForm((current) => ({ ...current, clienteBloco: event.target.value }))} placeholder="Ex: A" />
                  </div>
                  <div className="space-y-2">
                    <Label>Apartamento</Label>
                    <Input value={form.clienteApartamento} onChange={(event) => setForm((current) => ({ ...current, clienteApartamento: event.target.value }))} placeholder="Ex: 101" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Observacoes</Label>
                    <Textarea value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Preferencias, restricoes, forma de entrega, recados importantes..." rows={5} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveCliente} disabled={saving || !form.nome.trim()}>
                    {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isCreating ? 'Cadastrar cliente' : 'Salvar edicao'}
                  </Button>
                  {isCreating ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedId(null)
                        setIsCreating(false)
                        resetForm()
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {!isCreating && selected ? (
            <Card className="min-w-0 border-border/70 bg-card/95">
                <CardHeader className="pb-3">
                  <CardTitle>Historico de pedidos</CardTitle>
                  <CardDescription>Ultimos pedidos vinculados a este cliente para consulta rapida.</CardDescription>
                </CardHeader>
                <CardContent>
                  {selected.pedidos?.length ? (
                    <div className="space-y-3">
                      {selected.pedidos.map((pedido) => (
                        <div key={pedido.id} className="min-w-0 rounded-2xl border bg-background/80 p-4 transition-colors hover:border-primary/35">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p>
                              <p className="text-sm text-muted-foreground">{formatDateTimeInSaoPaulo(pedido.criadoEm)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{pedido.status}</Badge>
                              <Badge>{formatarMoeda(pedido.total)}</Badge>
                            </div>
                          </div>
                          <Separator className="my-3" />
                          <div className="space-y-2 text-sm text-muted-foreground">
                            {pedido.itens.map((item) => (
                              <div key={item.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <span className="min-w-0 break-words">{item.quantidade}x {item.nomeProdutoSnapshot}</span>
                                <span className="shrink-0 sm:text-right">{formatarMoeda(item.totalItem)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Este cliente ainda nao possui pedidos vinculados.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card className="border-dashed border-border/70 bg-card/95">
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <UserRound className="mb-3 h-10 w-10 text-primary/50" />
              <p className="font-medium text-foreground">Selecione um cliente para ver os dados completos</p>
              <p className="mt-1 max-w-md">Voce pode buscar na lista lateral ou criar um novo cadastro para comecar a registrar historico, sabores e observacoes.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
