'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ChevronRight, ClipboardList, Gift, MapPin, MessageCircle, Phone, Plus, RefreshCw, Save, Search, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { MIMO_COOKIE_THRESHOLD } from '@/lib/mimos'
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

type ClienteDialogTab = 'resumo' | 'editar'

const emptyForm = {
  nome: '',
  telefone: '',
  whatsapp: '',
  clienteBloco: '',
  clienteApartamento: '',
  observacoes: '',
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar clientes')
  return data
}

function getClienteInitials(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? '').join('')
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    FEITO: 'Novo',
    ACEITO: 'Aceito',
    PREPARACAO: 'Em preparo',
    PRONTO_ENTREGA: 'Pronto',
    ENTREGUE: 'Entregue',
    CANCELADO: 'Cancelado',
  }
  return labels[status] ?? status
}

export function ClientesPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<ClienteDialogTab>('resumo')
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deliveringMimo, setDeliveringMimo] = useState(false)
  const [message, setMessage] = useState('')

  const url = useMemo(() => `/api/admin/clientes?search=${encodeURIComponent(search)}`, [search])
  const { data: clientes, isLoading, mutate } = useSWR<ClienteListItem[]>(url, fetcher, { refreshInterval: 15000 })
  const { data: selected, isLoading: isLoadingSelected, mutate: mutateSelected } = useSWR<ClienteDetalhe>(
    selectedId && dialogOpen && !isCreating ? `/api/admin/clientes/${selectedId}` : null,
    fetcher,
  )

  useEffect(() => {
    if (!selected) return
    setForm({
      nome: selected.nome || '',
      telefone: formatPhoneInput(selected.telefone || ''),
      whatsapp: formatPhoneInput(selected.whatsapp || selected.telefone || ''),
      clienteBloco: selected.clienteBloco || '',
      clienteApartamento: selected.clienteApartamento || '',
      observacoes: selected.observacoes || '',
    })
  }, [selected])

  const startNewCliente = () => {
    setSelectedId(null)
    setIsCreating(true)
    setDialogTab('editar')
    setForm(emptyForm)
    setMessage('')
    setDialogOpen(true)
  }

  const selectCliente = (cliente: ClienteListItem) => {
    setSelectedId(cliente.id)
    setIsCreating(false)
    setDialogTab('resumo')
    setMessage('')
    setDialogOpen(true)
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
          telefone: normalizePhone(form.telefone) || undefined,
          whatsapp: normalizePhone(form.whatsapp),
          clienteBloco: form.clienteBloco || undefined,
          clienteApartamento: form.clienteApartamento || undefined,
          observacoes: form.observacoes || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar cliente')

      if (isCreating) {
        setSelectedId(data.id)
        setIsCreating(false)
      } else {
        mutateSelected(data, false)
      }
      setDialogTab('resumo')
      setMessage(isCreating ? 'Cliente cadastrado.' : 'Cliente atualizado.')
      await mutate()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

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

  const fidelidade = selected?.resumoFidelidade
  const saboresFavoritos = selected?.resumoConsumo.sabores.slice(0, 4) ?? []
  const isSuccessMessage = message === 'Cliente cadastrado.'
    || message === 'Cliente atualizado.'
    || message === 'Mimo entregue registrado com sucesso.'
  const locationLabel = selected?.clienteBloco || selected?.clienteApartamento
    ? `${selected.clienteBloco ? `Bloco ${selected.clienteBloco}` : 'Sem bloco'}${selected.clienteApartamento ? ` · Apto ${selected.clienteApartamento}` : ''}`
    : 'Localização não informada'

  const renderForm = () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Nome</Label>
          <Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} className="h-9 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Telefone principal</Label>
          <Input value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: formatPhoneInput(event.target.value) }))} placeholder="(47) 99999-9999" className="h-9 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">WhatsApp</Label>
          <Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: formatPhoneInput(event.target.value) }))} placeholder="(47) 99999-9999" className="h-9 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bloco</Label>
          <Input value={form.clienteBloco} onChange={(event) => setForm((current) => ({ ...current, clienteBloco: event.target.value }))} placeholder="Ex: A" className="h-9 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Apartamento</Label>
          <Input value={form.clienteApartamento} onChange={(event) => setForm((current) => ({ ...current, clienteApartamento: event.target.value }))} placeholder="Ex: 101" className="h-9 rounded-lg" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Observações</Label>
          <Textarea value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Preferências, restrições e recados importantes" rows={3} className="rounded-lg" />
        </div>
      </div>

      {message ? <p className={`rounded-lg border p-2.5 text-sm ${isSuccessMessage ? 'border-primary/25 bg-primary/10 text-primary' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>{message}</p> : null}

      <div className="sticky bottom-0 flex gap-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur">
        <Button onClick={saveCliente} disabled={saving || !form.nome.trim()} className="h-9 flex-1 rounded-lg">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isCreating ? 'Cadastrar cliente' : 'Salvar alterações'}
        </Button>
        {isCreating ? <Button variant="outline" className="h-9 rounded-lg" onClick={() => setDialogOpen(false)}>Cancelar</Button> : null}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-3 overflow-x-hidden">
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-[#E7B99B]/12 p-3 shadow-sm md:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span>
              <div><h1 className="text-xl font-bold md:text-2xl">Clientes</h1><p className="text-xs text-muted-foreground">Busca, histórico e relacionamento.</p></div>
            </div>
          </div>
          <Button size="sm" className="h-9 shrink-0 rounded-lg" onClick={startNewCliente}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo cliente</span><span className="sm:hidden">Novo</span></Button>
        </div>
      </section>

      <Card className="gap-0 rounded-xl border-border/70 py-0">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou WhatsApp" className="h-9 rounded-lg pl-9" />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label="Atualizar clientes" onClick={() => mutate()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">{clientes?.length ?? 0} cliente(s) encontrado(s)</p>
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card" aria-label="Lista de clientes">
        {isLoading ? (
          <div className="space-y-px"><Skeleton className="h-16 rounded-none" /><Skeleton className="h-16 rounded-none" /><Skeleton className="h-16 rounded-none" /></div>
        ) : clientes?.length ? clientes.map((cliente) => (
          <button key={cliente.id} type="button" onClick={() => selectCliente(cliente)} className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-primary/[0.04]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-xs font-bold text-primary">{getClienteInitials(cliente.nome)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{cliente.nome}</p>
              <p className="truncate text-xs text-muted-foreground">
                {cliente.telefone ? formatarTelefone(cliente.telefone) : 'Sem telefone'}
                {cliente.clienteBloco ? ` · Bloco ${cliente.clienteBloco}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium">{cliente.totalPedidos} pedido(s)</p>
              <p className="max-w-28 truncate text-[10px] text-muted-foreground">{cliente.ultimoPedidoEm ? formatDateTimeInSaoPaulo(cliente.ultimoPedidoEm) : 'Sem histórico'}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )) : <p className="p-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[min(92dvh,780px)] w-[calc(100vw-0.75rem)] max-w-3xl flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3 pr-10 text-left">
            <DialogTitle className="truncate text-base">{isCreating ? 'Novo cliente' : selected?.nome || 'Cliente'}</DialogTitle>
            <DialogDescription className="text-xs">{isCreating ? 'Crie o cadastro sem campos ou cartões desnecessários.' : 'Consulte o relacionamento ou edite os dados em abas separadas.'}</DialogDescription>
          </DialogHeader>

          {isCreating ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderForm()}</div>
          ) : isLoadingSelected || !selected ? (
            <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-28" /><Skeleton className="h-40" /></div>
          ) : (
            <Tabs value={dialogTab} onValueChange={(value) => setDialogTab(value as ClienteDialogTab)} className="flex min-h-0 flex-1 flex-col p-3">
              <TabsList className="grid h-9 shrink-0 grid-cols-2 rounded-lg p-0.5">
                <TabsTrigger value="resumo" className="rounded-md text-xs">Resumo</TabsTrigger>
                <TabsTrigger value="editar" className="rounded-md text-xs">Editar cadastro</TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-3">
                  {message ? <p className="rounded-lg border border-primary/25 bg-primary/10 p-2.5 text-sm text-primary">{message}</p> : null}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-background/70 p-2.5"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Phone className="h-3.5 w-3.5" />Telefone</div><p className="mt-1 truncate text-sm font-semibold">{selected.telefone ? formatarTelefone(selected.telefone) : 'Não informado'}</p></div>
                    <div className="rounded-lg border bg-background/70 p-2.5"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</div><p className="mt-1 truncate text-sm font-semibold">{selected.whatsapp ? formatarTelefone(selected.whatsapp) : 'Não informado'}</p></div>
                    <div className="rounded-lg border bg-background/70 p-2.5"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Localização</div><p className="mt-1 truncate text-sm font-semibold">{locationLabel}</p></div>
                    <div className="rounded-lg border bg-background/70 p-2.5"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" />Relacionamento</div><p className="mt-1 text-sm font-semibold">{selected.totalPedidos} pedidos · {selected.resumoConsumo.totalCookies} cookies</p></div>
                  </div>

                  {selected.observacoes ? <div className="rounded-lg border border-[#C56813]/20 bg-[#C56813]/6 p-2.5"><p className="text-[11px] font-medium text-muted-foreground">Observações</p><p className="mt-1 text-sm">{selected.observacoes}</p></div> : null}

                  <div className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-semibold">Fidelidade</p><p className="text-xs text-muted-foreground">{fidelidade?.mimosDisponiveis ? `${fidelidade.mimosDisponiveis} mimo(s) disponível(is).` : `Faltam ${fidelidade?.faltamParaProximo ?? MIMO_COOKIE_THRESHOLD} cookie(s) para o próximo.`}</p></div>
                      <Badge variant="outline" className="shrink-0">{fidelidade?.progressoAtual ?? 0}/{MIMO_COOKIE_THRESHOLD}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-muted-foreground">
                      <div className="rounded-md bg-muted/30 p-1.5"><strong className="block text-sm text-foreground">{fidelidade?.totalMimosGerados ?? 0}</strong>Gerados</div>
                      <div className="rounded-md bg-muted/30 p-1.5"><strong className="block text-sm text-foreground">{fidelidade?.mimosEntregues ?? 0}</strong>Entregues</div>
                      <div className="rounded-md bg-muted/30 p-1.5"><strong className="block text-sm text-foreground">{fidelidade?.mimosDisponiveis ?? 0}</strong>Disponíveis</div>
                    </div>
                    <Button size="sm" className="mt-2 h-8 w-full rounded-lg text-xs" onClick={marcarMimoEntregue} disabled={deliveringMimo || !fidelidade?.mimosDisponiveis} variant={fidelidade?.mimosDisponiveis ? 'default' : 'outline'}>
                      {deliveringMimo ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}Marcar mimo entregue
                    </Button>
                  </div>

                  {saboresFavoritos.length ? <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Sabores mais comprados</p><div className="flex flex-wrap gap-1.5">{saboresFavoritos.map((sabor) => <Badge key={sabor.nome} variant="outline" className="rounded-md text-[10px]">{sabor.nome} · {sabor.quantidade}</Badge>)}</div></div> : null}

                  <div>
                    <p className="mb-2 text-sm font-semibold">Histórico de pedidos</p>
                    {selected.pedidos?.length ? (
                      <div className="overflow-hidden rounded-xl border border-border/70">
                        {selected.pedidos.map((pedido) => (
                          <div key={pedido.id} className="border-b border-border/60 p-2.5 last:border-b-0">
                            <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p><p className="text-[10px] text-muted-foreground">{formatDateTimeInSaoPaulo(pedido.criadoEm)}</p></div><div className="text-right"><p className="text-xs font-bold text-primary">{formatarMoeda(pedido.total)}</p><p className="text-[10px] text-muted-foreground">{getStatusLabel(pedido.status)}</p></div></div>
                            <Separator className="my-2" />
                            <p className="line-clamp-2 text-xs text-muted-foreground">{pedido.itens.map((item) => `${item.quantidade}x ${item.nomeProdutoSnapshot}`).join(', ')}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">Este cliente ainda não possui pedidos vinculados.</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="editar" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{renderForm()}</TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
