'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Plus, RefreshCw, Save, Search, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import type { Cliente } from '@/lib/types'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Erro ao carregar clientes')
  return data
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function ClientesPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({ nome: '', telefone: '', whatsapp: '', clienteBloco: '', clienteApartamento: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const url = useMemo(() => `/api/admin/clientes?search=${encodeURIComponent(search)}`, [search])
  const { data: clientes, isLoading, mutate } = useSWR<Cliente[]>(url, fetcher, { refreshInterval: 15000 })

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
    setSelected(null)
    setIsCreating(true)
    setMessage('')
    setForm({ nome: '', telefone: '', whatsapp: '', clienteBloco: '', clienteApartamento: '', observacoes: '' })
  }

  const selectCliente = (cliente: Cliente) => {
    setSelected(cliente)
    setIsCreating(false)
    setMessage('')
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
          ...(isCreating ? { telefone: onlyDigits(form.telefone) } : {}),
          whatsapp: onlyDigits(form.whatsapp),
          clienteBloco: form.clienteBloco || undefined,
          clienteApartamento: form.clienteApartamento || undefined,
          observacoes: form.observacoes || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar cliente')
      setSelected(data)
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><UserRound className="h-6 w-6 text-primary" />Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastro por WhatsApp, endereço no Paulistano, observações e histórico de pedidos.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={startNewCliente}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
          <Button variant="outline" onClick={() => mutate()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader><CardTitle>Buscar cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou telefone" className="pl-9" />
            </div>
            <div className="space-y-2">
              {isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : clientes?.length ? clientes.map((cliente) => (
                <button key={cliente.id} type="button" onClick={() => selectCliente(cliente)} className={`w-full rounded-xl border p-3 text-left transition hover:border-primary/40 ${selected?.id === cliente.id ? 'border-primary bg-primary/10' : 'bg-card'}`}>
                  <p className="font-semibold">{cliente.nome}</p>
                  <p className="text-sm text-muted-foreground">{formatarTelefone(cliente.telefone)} · {cliente.pedidos?.length ?? 0} pedido(s)</p>
                </button>
              )) : <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
          </CardContent>
        </Card>

        {selected || isCreating ? (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{isCreating ? 'Cadastrar cliente' : 'Editar cliente'}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} disabled={!isCreating} placeholder="(00) 00000-0000" /></div>
                <div className="space-y-2"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Bloco</Label><Input value={form.clienteBloco} onChange={(event) => setForm((current) => ({ ...current, clienteBloco: event.target.value }))} placeholder="Ex: A" /></div>
                <div className="space-y-2"><Label>Apartamento</Label><Input value={form.clienteApartamento} onChange={(event) => setForm((current) => ({ ...current, clienteApartamento: event.target.value }))} placeholder="Ex: 101" /></div>
                <div className="space-y-2 md:col-span-2"><Label>Observações</Label><Input value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Preferências, restrições, observações de entrega..." /></div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button onClick={saveCliente} disabled={saving}>{saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{isCreating ? 'Cadastrar cliente' : 'Salvar edição'}</Button>
                  {isCreating && <Button variant="outline" onClick={() => { setIsCreating(false); setForm({ nome: '', telefone: '', whatsapp: '', clienteBloco: '', clienteApartamento: '', observacoes: '' }) }}>Cancelar</Button>}
                </div>
              </CardContent>
            </Card>

            {!isCreating && selected && <Card>
              <CardHeader><CardTitle>Histórico de pedidos</CardTitle></CardHeader>
              <CardContent>
                {selected.pedidos?.length ? (
                  <div className="space-y-3">
                    {selected.pedidos.map((pedido) => (
                      <div key={pedido.id} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-semibold">#{pedido.id.slice(-8).toUpperCase()}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(pedido.criadoEm)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2"><Badge variant="outline">{pedido.status}</Badge><Badge>{formatarMoeda(pedido.total)}</Badge></div>
                        </div>
                        <Separator className="my-3" />
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {pedido.itens.map((item) => <div key={item.id} className="flex justify-between gap-3"><span>{item.quantidade}x {item.nomeProdutoSnapshot}</span><span>{formatarMoeda(item.totalItem)}</span></div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Este cliente ainda nao possui pedidos vinculados.</p>}
              </CardContent>
            </Card>}
          </div>
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Selecione um cliente para ver dados e histórico.</CardContent></Card>
        )}
      </div>
    </div>
  )
}
