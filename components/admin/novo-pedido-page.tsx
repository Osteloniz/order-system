'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, ChevronsUpDown, Minus, Plus, Save, ShoppingBag, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { formatPhoneInput, isValidPhone, normalizePhone } from '@/lib/phone'
import type { Cliente, Cupom, Pedido, Produto, TipoEntrega, TipoPagamento } from '@/lib/types'

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || `Erro ao carregar ${url}`)
  }
  return data
}

type ProdutoAdmin = Produto & { categoriaNome?: string }
type CartItem = { produto: ProdutoAdmin; quantidade: number }

type NovoPedidoAdminPageProps = {
  compact?: boolean
  initialPedido?: Pedido | null
  onCreated?: () => void
  onSaved?: (pedido: Pedido) => void
}

function parseCurrencyToCents(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

function formatCurrencyInput(value: string) {
  const cents = parseCurrencyToCents(value)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

function calcularDescontoCupom(subtotal: number, cupomCodigo: string, cupons?: Cupom[], currentCouponCode?: string) {
  const cupom = cupons?.find(item => item.codigo === cupomCodigo)
  if (!cupom) return 0
  if (!cupom.ativo) return 0

  const agora = Date.now()
  if (new Date(cupom.expiraEm).getTime() <= agora) return 0
  if (cupom.usos >= cupom.maxUsos && cupom.codigo !== currentCouponCode) return 0

  const bruto = cupom.tipo === 'PERCENTUAL'
    ? Math.round(subtotal * (cupom.valor / 100))
    : cupom.valor
  return Math.min(bruto, subtotal)
}

export function NovoPedidoAdminPage({ compact = false, initialPedido = null, onCreated, onSaved }: NovoPedidoAdminPageProps) {
  const isEditing = Boolean(initialPedido)
  const { data: produtos, isLoading } = useSWR<ProdutoAdmin[]>('/api/admin/produtos', fetcher)
  const { data: cupons } = useSWR<Cupom[]>('/api/admin/cupons', fetcher)
  const [searchCliente, setSearchCliente] = useState('')
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false)
  const clientesUrl = searchCliente.trim().length >= 2
    ? `/api/admin/clientes?search=${encodeURIComponent(searchCliente.trim())}&take=8`
    : '/api/admin/clientes?take=8'
  const { data: clientes } = useSWR<Cliente[]>(clientesUrl, fetcher)
  const produtosAtivos = useMemo(() => (produtos || []).filter(produto => produto.ativo), [produtos])

  const [clienteId, setClienteId] = useState('')
  const [nome, setNome] = useState('')
  const [contatoPrincipal, setContatoPrincipal] = useState('')
  const [usarWhatsappDiferente, setUsarWhatsappDiferente] = useState(false)
  const [whatsapp, setWhatsapp] = useState('')
  const [bloco, setBloco] = useState('')
  const [apartamento, setApartamento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [observacoesPedido, setObservacoesPedido] = useState('')
  const [responsavelPedido, setResponsavelPedido] = useState('')
  const [destinatariosPedido, setDestinatariosPedido] = useState('')
  const [levadoEmData, setLevadoEmData] = useState('')
  const [levadoEmHora, setLevadoEmHora] = useState('')
  const [pagamento, setPagamento] = useState<TipoPagamento>('DINHEIRO')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [encomendaData, setEncomendaData] = useState('')
  const [encomendaHora, setEncomendaHora] = useState('')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [valorPromocionalInput, setValorPromocionalInput] = useState('')
  const [items, setItems] = useState<CartItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [initializedEditState, setInitializedEditState] = useState(false)
  const dataPedidoLabel = useMemo(() => {
    const value = initialPedido?.criadoEm ?? new Date().toISOString()
    return new Date(value).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }, [initialPedido?.criadoEm])

  useEffect(() => {
    if (!initialPedido || !produtosAtivos.length || initializedEditState) return

    setClienteId(initialPedido.clienteId || '')
    setNome(initialPedido.clienteNome || '')
    const telefoneInicial = formatPhoneInput(initialPedido.clienteTelefone || '')
    const whatsappInicial = formatPhoneInput(initialPedido.clienteWhatsapp || '')
    setContatoPrincipal(telefoneInicial || whatsappInicial)
    setUsarWhatsappDiferente(Boolean(
      initialPedido.clienteWhatsapp &&
      normalizePhone(initialPedido.clienteWhatsapp) !== normalizePhone(initialPedido.clienteTelefone)
    ))
    setWhatsapp(
      initialPedido.clienteWhatsapp &&
      normalizePhone(initialPedido.clienteWhatsapp) !== normalizePhone(initialPedido.clienteTelefone)
        ? whatsappInicial
        : ''
    )
    setBloco(initialPedido.clienteBloco || '')
    setApartamento(initialPedido.clienteApartamento || '')
    setObservacoesPedido(initialPedido.observacoesPedido || '')
    setResponsavelPedido(initialPedido.responsavelPedido || '')
    setDestinatariosPedido(initialPedido.destinatariosPedido || '')
    setPagamento(initialPedido.pagamento)
    setTipoEntrega(initialPedido.tipoEntrega)
    setCupomCodigo(initialPedido.cupomCodigoSnapshot || '')
    if (!initialPedido.cupomCodigoSnapshot && (initialPedido.descontoValor ?? 0) > 0) {
      setValorPromocionalInput(formatCurrencyInput(String(initialPedido.descontoValor)))
    }
    if (initialPedido.encomendaPara) {
      const data = new Date(initialPedido.encomendaPara)
      const dataString = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(data)
      const horaString = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(data)
      setEncomendaData(dataString)
      setEncomendaHora(horaString)
    }
    if (initialPedido.levadoEm) {
      const dataLevada = new Date(initialPedido.levadoEm)
      const levadoDataString = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dataLevada)
      const levadoHoraString = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(dataLevada)
      setLevadoEmData(levadoDataString)
      setLevadoEmHora(levadoHoraString)
    }

    const itemMap = new Map(initialPedido.itens.map(item => [item.produtoId, item.quantidade]))
    setItems(
      produtosAtivos
        .filter(produto => itemMap.has(produto.id))
        .map(produto => ({ produto, quantidade: itemMap.get(produto.id) ?? 1 }))
    )
    setInitializedEditState(true)
  }, [initialPedido, produtosAtivos, initializedEditState])

  const clienteSelecionado = useMemo(
    () => (clientes || []).find(cliente => cliente.id === clienteId) || null,
    [clientes, clienteId]
  )

  const subtotal = items.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0)
  const valorPromocional = parseCurrencyToCents(valorPromocionalInput)
  const descontoCupom = valorPromocional > 0 ? 0 : calcularDescontoCupom(subtotal, cupomCodigo, cupons, initialPedido?.cupomCodigoSnapshot || undefined)
  const descontoValor = valorPromocional > 0 ? Math.min(valorPromocional, subtotal) : descontoCupom
  const total = Math.max(0, subtotal - descontoValor)
  const telefoneLimpo = normalizePhone(contatoPrincipal)
  const whatsappLimpo = normalizePhone(usarWhatsappDiferente ? whatsapp : contatoPrincipal)

  const addProduct = (produto: ProdutoAdmin) => {
    setItems(current => {
      const existing = current.find(item => item.produto.id === produto.id)
      if (existing) {
        return current.map(item => item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item)
      }
      return [...current, { produto, quantidade: 1 }]
    })
  }

  const changeQuantity = (produtoId: string, delta: number) => {
    setItems(current => current
      .map(item => item.produto.id === produtoId ? { ...item, quantidade: item.quantidade + delta } : item)
      .filter(item => item.quantidade > 0)
    )
  }

  const selectCliente = (cliente: Cliente) => {
    setClienteId(cliente.id)
    setNome(cliente.nome || '')
    const telefoneCliente = formatPhoneInput(cliente.telefone || cliente.whatsapp || '')
    const whatsappCliente = formatPhoneInput(cliente.whatsapp || '')
    setContatoPrincipal(telefoneCliente)
    setUsarWhatsappDiferente(Boolean(
      cliente.whatsapp &&
      normalizePhone(cliente.whatsapp) !== normalizePhone(cliente.telefone)
    ))
    setWhatsapp(
      cliente.whatsapp && normalizePhone(cliente.whatsapp) !== normalizePhone(cliente.telefone)
        ? whatsappCliente
        : ''
    )
    setBloco(cliente.clienteBloco || '')
    setApartamento(cliente.clienteApartamento || '')
    setObservacoes(cliente.observacoes || '')
    setSearchCliente(cliente.nome)
  }

  const clearSelectedCliente = () => {
    setClienteId('')
    setSearchCliente('')
  }

  const resetForm = () => {
    setClienteId('')
    setNome('')
    setContatoPrincipal('')
    setUsarWhatsappDiferente(false)
    setWhatsapp('')
    setBloco('')
    setApartamento('')
    setObservacoes('')
    setObservacoesPedido('')
    setResponsavelPedido('')
    setDestinatariosPedido('')
    setLevadoEmData('')
    setLevadoEmHora('')
    setPagamento('DINHEIRO')
    setTipoEntrega('RESERVA_PAULISTANO')
    setEncomendaData('')
    setEncomendaHora('')
    setCupomCodigo('')
    setValorPromocionalInput('')
    setItems([])
    setSearchCliente('')
  }

  const handleSubmit = async () => {
    setError('')
    setMessage('')

    if (!nome.trim()) return setError('Informe o nome do cliente')
    if (telefoneLimpo && !isValidPhone(telefoneLimpo)) return setError('Celular invalido')
    if (whatsappLimpo && !isValidPhone(whatsappLimpo)) return setError('WhatsApp invalido')
    if (tipoEntrega === 'RESERVA_PAULISTANO' && (!bloco.trim() || !apartamento.trim())) return setError('Informe bloco e apartamento')
    if (tipoEntrega === 'ENCOMENDA' && (!encomendaData || !encomendaHora)) return setError('Informe data e hora da encomenda')
    if ((levadoEmData && !levadoEmHora) || (!levadoEmData && levadoEmHora)) return setError('Informe data e hora de quando o pedido foi levado')
    if (items.length === 0) return setError('Adicione pelo menos um produto')
    if (cupomCodigo && valorPromocional > 0) return setError('Use cupom ou valor promocional, nao os dois')

    setIsSubmitting(true)
    try {
      const response = await fetch(isEditing ? `/api/admin/pedidos/${initialPedido?.id}` : '/api/admin/pedidos', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: clienteId || undefined,
          clienteNome: nome.trim(),
          clienteTelefone: telefoneLimpo || undefined,
          clienteWhatsapp: whatsappLimpo || undefined,
          clienteBloco: tipoEntrega === 'RESERVA_PAULISTANO' ? bloco.trim() || undefined : undefined,
          clienteApartamento: tipoEntrega === 'RESERVA_PAULISTANO' ? apartamento.trim() || undefined : undefined,
          clienteObservacoes: observacoes.trim() || undefined,
          observacoesPedido: observacoesPedido.trim() || undefined,
          responsavelPedido: responsavelPedido.trim() || undefined,
          destinatariosPedido: destinatariosPedido.trim() || undefined,
          levadoEm: levadoEmData && levadoEmHora ? `${levadoEmData}T${levadoEmHora}:00-03:00` : undefined,
          pagamento,
          tipoEntrega,
          encomendaPara: tipoEntrega === 'ENCOMENDA' ? `${encomendaData}T${encomendaHora}:00-03:00` : undefined,
          statusPagamento: pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE',
          cupomCodigo: cupomCodigo || undefined,
          valorPromocional: valorPromocional || undefined,
          itens: items.map(item => ({ produtoId: item.produto.id, quantidade: item.quantidade }))
        })
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Erro ao salvar pedido')

      setMessage(isEditing ? `Pedido #${data.id.slice(-8).toUpperCase()} atualizado com sucesso.` : `Pedido #${data.id.slice(-8).toUpperCase()} criado com sucesso.`)
      if (!isEditing) {
        resetForm()
        onCreated?.()
      }
      onSaved?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold">{isEditing ? 'Editar pedido' : 'Novo pedido manual'}</h1>
          <p className="text-sm text-muted-foreground">Use o cadastro de clientes, aplique cupom e mantenha o valor do pedido alinhado com o estoque.</p>
        </div>
      )}

      <div className={compact ? 'grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]' : 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]'}>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente cadastrado</Label>
                <Popover open={clienteComboboxOpen} onOpenChange={setClienteComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clienteComboboxOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {clienteSelecionado
                          ? `${clienteSelecionado.nome}${clienteSelecionado.telefone ? ` • ${formatarTelefone(clienteSelecionado.telefone)}` : ' • sem celular'}`
                          : 'Buscar cliente por nome'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Digite o nome do cliente"
                        value={searchCliente}
                        onValueChange={setSearchCliente}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {clientes?.map(cliente => (
                            <CommandItem
                              key={cliente.id}
                              value={`${cliente.nome} ${cliente.telefone || ''}`}
                              onSelect={() => {
                                selectCliente(cliente)
                                setClienteComboboxOpen(false)
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', clienteId === cliente.id ? 'opacity-100' : 'opacity-0')} />
                              <div className="min-w-0">
                                <p className="truncate">{cliente.nome}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {cliente.telefone ? formatarTelefone(cliente.telefone) : 'Sem celular'}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {clienteId && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4" />
                      <span>Cliente vinculado ao cadastro.</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={clearSelectedCliente}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2"><Label>Nome</Label><Input value={nome} onChange={event => setNome(event.target.value)} placeholder="Nome do cliente" /></div>
                <div className="min-w-0 space-y-2"><Label>Data do pedido</Label><Input value={dataPedidoLabel} readOnly /></div>
                <div className="min-w-0 space-y-2 sm:col-span-2">
                  <Label>Contato principal</Label>
                  <Input value={contatoPrincipal} onChange={event => setContatoPrincipal(formatPhoneInput(event.target.value))} placeholder="Celular ou WhatsApp do cliente" />
                  <button type="button" onClick={() => setUsarWhatsappDiferente((current) => !current)} className="text-xs text-primary hover:underline">
                    {usarWhatsappDiferente ? 'Usar apenas um contato' : 'Informar WhatsApp diferente'}
                  </button>
                </div>
                {usarWhatsappDiferente && (
                  <div className="min-w-0 space-y-2 sm:col-span-2">
                    <Label>WhatsApp separado</Label>
                    <Input value={whatsapp} onChange={event => setWhatsapp(formatPhoneInput(event.target.value))} placeholder="Preencha somente se o WhatsApp for diferente" />
                  </div>
                )}
                <div className="min-w-0 space-y-2"><Label>Entrega</Label><select value={tipoEntrega} onChange={event => setTipoEntrega(event.target.value as TipoEntrega)} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"><option value="RESERVA_PAULISTANO">Condominio (Reserva Paulistano)</option><option value="RETIRADA">Retirada</option><option value="ENCOMENDA">Encomenda</option></select></div>
                {tipoEntrega === 'RESERVA_PAULISTANO' && (
                  <>
                    <div className="min-w-0 space-y-2"><Label>Bloco</Label><Input value={bloco} onChange={event => setBloco(event.target.value)} placeholder="Ex: A" /></div>
                    <div className="min-w-0 space-y-2"><Label>Apartamento</Label><Input value={apartamento} onChange={event => setApartamento(event.target.value)} placeholder="Ex: 101" /></div>
                  </>
                )}
                {tipoEntrega === 'ENCOMENDA' && (
                  <>
                    <div className="min-w-0 space-y-2"><Label>Data da encomenda</Label><Input type="date" value={encomendaData} onChange={event => setEncomendaData(event.target.value)} /></div>
                    <div className="min-w-0 space-y-2"><Label>Hora da encomenda</Label><Input type="time" value={encomendaHora} onChange={event => setEncomendaHora(event.target.value)} /></div>
                  </>
                )}
                <div className="min-w-0 space-y-2"><Label>Pagamento</Label><select value={pagamento} onChange={event => setPagamento(event.target.value as TipoPagamento)} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"><option value="DINHEIRO">Dinheiro</option><option value="PIX">PIX</option><option value="CARTAO">Cartao</option></select></div>
                <div className="min-w-0 space-y-2"><Label>Responsavel pelo pedido</Label><Input value={responsavelPedido} onChange={event => setResponsavelPedido(event.target.value)} placeholder="Ex: Vitor" /></div>
                <div className="min-w-0 space-y-2"><Label>Cupom</Label><select value={cupomCodigo} onChange={event => { setCupomCodigo(event.target.value); if (event.target.value) setValorPromocionalInput('') }} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"><option value="">Sem cupom</option>{cupons?.map(cupom => <option key={cupom.id} value={cupom.codigo}>{cupom.codigo}</option>)}</select></div>
                <div className="min-w-0 space-y-2"><Label>Valor promocional interno</Label><Input value={valorPromocionalInput} onChange={event => { setValorPromocionalInput(formatCurrencyInput(event.target.value)); if (parseCurrencyToCents(event.target.value) > 0) setCupomCodigo('') }} placeholder="R$ 0,00" /></div>
                <div className="min-w-0 space-y-2"><Label>Data que levou</Label><Input type="date" value={levadoEmData} onChange={event => setLevadoEmData(event.target.value)} /></div>
                <div className="min-w-0 space-y-2"><Label>Hora que levou</Label><Input type="time" value={levadoEmHora} onChange={event => setLevadoEmHora(event.target.value)} /></div>
                <div className="min-w-0 space-y-2 sm:col-span-2"><Label>Separar para / nomes finais</Label><Input value={destinatariosPedido} onChange={event => setDestinatariosPedido(event.target.value)} placeholder="Ex: Ana, Julia, Marcos" /></div>
                <div className="min-w-0 space-y-2 sm:col-span-2"><Label>Observações do cliente</Label><Input value={observacoes} onChange={event => setObservacoes(event.target.value)} placeholder="Preferências, restrições, observações de entrega..." /></div>
                <div className="min-w-0 space-y-2 sm:col-span-2"><Label>Observacoes do pedido</Label><Input value={observacoesPedido} onChange={event => setObservacoesPedido(event.target.value)} placeholder="Controle interno, combinados, detalhes da venda..." /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <p className="text-sm text-muted-foreground">Carregando produtos...</p> : produtosAtivos.map(produto => (
                <div key={produto.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="font-medium">{produto.nome}</p><p className="text-sm text-muted-foreground">{produto.categoriaNome} • {formatarMoeda(produto.preco)}</p></div>
                  <Button type="button" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => addProduct(produto)}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit min-w-0 lg:sticky lg:top-6">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto adicionado.</p> : items.map(item => (
              <div key={item.produto.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{item.produto.nome}</p><p className="text-sm text-muted-foreground">{formatarMoeda(item.produto.preco)} un.</p></div><Badge>{item.quantidade}x</Badge></div>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => changeQuantity(item.produto.id, -1)}><Minus className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => changeQuantity(item.produto.id, 1)}><Plus className="h-4 w-4" /></Button></div>
              </div>
            ))}
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatarMoeda(subtotal)}</span></div>
              {cupomCodigo && descontoValor > 0 && <div className="flex justify-between text-success"><span>Cupom {cupomCodigo}</span><span>-{formatarMoeda(descontoValor)}</span></div>}
              {!cupomCodigo && valorPromocional > 0 && <div className="flex justify-between text-success"><span>Valor promocional</span><span>-{formatarMoeda(descontoValor)}</span></div>}
            </div>
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatarMoeda(total)}</span></div>
            {clienteSelecionado && <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Cliente selecionado: {clienteSelecionado.nome} {clienteSelecionado.telefone ? `• ${formatarTelefone(clienteSelecionado.telefone)}` : '• sem celular'}.</p>}
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {message && <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}
            <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}><Save className="mr-2 h-4 w-4" />{isSubmitting ? (isEditing ? 'Salvando...' : 'Criando...') : (isEditing ? 'Salvar pedido' : 'Criar pedido')}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
