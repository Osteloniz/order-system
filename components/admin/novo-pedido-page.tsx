'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Minus, Plus, Save, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatarMoeda } from '@/lib/calc'
import type { Cliente, Produto, TipoEntrega, TipoPagamento } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

type ProdutoAdmin = Produto & { categoriaNome?: string }
type CartItem = { produto: ProdutoAdmin; quantidade: number }

type NovoPedidoAdminPageProps = {
  compact?: boolean
  onCreated?: () => void
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function NovoPedidoAdminPage({ compact = false, onCreated }: NovoPedidoAdminPageProps) {
  const { data: produtos, isLoading } = useSWR<ProdutoAdmin[]>('/api/admin/produtos', fetcher)
  const produtosAtivos = useMemo(() => (produtos || []).filter(produto => produto.ativo), [produtos])

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bloco, setBloco] = useState('')
  const [apartamento, setApartamento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [clienteEncontrado, setClienteEncontrado] = useState<Cliente | null>(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [pagamento, setPagamento] = useState<TipoPagamento>('DINHEIRO')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [encomendaData, setEncomendaData] = useState('')
  const [encomendaHora, setEncomendaHora] = useState('')
  const [items, setItems] = useState<CartItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const total = items.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0)
  const telefoneLimpo = onlyDigits(telefone)

  useEffect(() => {
    if (telefoneLimpo.length < 10) {
      setClienteEncontrado(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setBuscandoCliente(true)
      try {
        const response = await fetch(`/api/admin/clientes?telefone=${telefoneLimpo}`, { signal: controller.signal })
        if (!response.ok) return
        const cliente = await response.json() as Cliente | null
        if (!cliente) {
          setClienteEncontrado(null)
          return
        }

        setClienteEncontrado(cliente)
        setNome(cliente.nome || '')
        setBloco(cliente.clienteBloco || '')
        setApartamento(cliente.clienteApartamento || '')
        setObservacoes(cliente.observacoes || '')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setClienteEncontrado(null)
        }
      } finally {
        setBuscandoCliente(false)
      }
    }, 450)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [telefoneLimpo])

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

  const resetForm = () => {
    setNome('')
    setTelefone('')
    setBloco('')
    setApartamento('')
    setObservacoes('')
    setClienteEncontrado(null)
    setPagamento('DINHEIRO')
    setTipoEntrega('RESERVA_PAULISTANO')
    setEncomendaData('')
    setEncomendaHora('')
    setItems([])
  }

  const handleSubmit = async () => {
    setError('')
    setMessage('')

    if (!nome.trim()) return setError('Informe o nome do cliente')
    if (telefoneLimpo.length < 10) return setError('Informe o celular do cliente')
    if (tipoEntrega === 'RESERVA_PAULISTANO' && (!bloco.trim() || !apartamento.trim())) return setError('Informe bloco e apartamento')
    if (tipoEntrega === 'ENCOMENDA' && (!encomendaData || !encomendaHora)) return setError('Informe data e hora da encomenda')
    if (items.length === 0) return setError('Adicione pelo menos um produto')

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/admin/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: nome.trim(),
          clienteTelefone: telefoneLimpo,
          clienteWhatsapp: telefoneLimpo,
          clienteBloco: tipoEntrega === 'RESERVA_PAULISTANO' ? bloco.trim() || undefined : undefined,
          clienteApartamento: tipoEntrega === 'RESERVA_PAULISTANO' ? apartamento.trim() || undefined : undefined,
          clienteObservacoes: observacoes.trim() || undefined,
          pagamento,
          tipoEntrega,
          encomendaPara: tipoEntrega === 'ENCOMENDA' ? `${encomendaData}T${encomendaHora}:00-03:00` : undefined,
          statusPagamento: pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE',
          itens: items.map(item => ({ produtoId: item.produto.id, quantidade: item.quantidade }))
        })
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Erro ao criar pedido')

      setMessage(`Pedido #${data.id.slice(-8).toUpperCase()} criado com sucesso.`)
      resetForm()
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold">Novo pedido manual</h1>
          <p className="text-sm text-muted-foreground">Use quando o cliente pedir pelo WhatsApp e voce quiser manter tudo na gestao.</p>
        </div>
      )}

      <div className={compact ? 'grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]' : 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]'}>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>Dados do cliente</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2"><Label>Nome</Label><Input value={nome} onChange={event => setNome(event.target.value)} placeholder="Nome do cliente" /></div>
              <div className="min-w-0 space-y-2"><Label>Celular</Label><Input value={telefone} onChange={event => setTelefone(formatPhone(event.target.value))} placeholder="(00) 00000-0000" /></div>
              <div className="min-w-0 sm:col-span-2">
                {buscandoCliente && <p className="text-xs text-muted-foreground">Buscando cliente pelo telefone...</p>}
                {clienteEncontrado && <p className="rounded-md border border-primary/25 bg-primary/10 p-2 text-xs text-primary">Cliente encontrado: dados preenchidos automaticamente. Ultimos pedidos: {clienteEncontrado.pedidos?.length ?? 0}</p>}
              </div>
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
              <div className="min-w-0 space-y-2 sm:col-span-2"><Label>Observações do cliente</Label><Input value={observacoes} onChange={event => setObservacoes(event.target.value)} placeholder="Preferências, restrições, observações de entrega..." /></div>
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
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatarMoeda(total)}</span></div>
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {message && <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}
            <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}><Save className="mr-2 h-4 w-4" />{isSubmitting ? 'Criando...' : 'Criar pedido'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
