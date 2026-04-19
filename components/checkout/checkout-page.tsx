'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Truck, Store, CreditCard, Banknote, QrCode, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useCart } from '@/contexts/cart-context'
import { formatarMoeda } from '@/lib/calc'
import { getCustomerProfile, saveCustomerProfile, saveRecentOrder } from '@/lib/customer-session'
import type { TipoPagamento, TipoEntrega, CriarPedidoPayload } from '@/lib/types'

interface MenuData {
  estabelecimento: string
  enderecoRetirada: string
  freteBase: number
  freteRaioKm: number
  freteKmExcedente: number
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function CheckoutPage() {
  const router = useRouter()
  const { itens, subtotal, limparCarrinho } = useCart()
  const { data: menuData } = useSWR<MenuData>('/api/menu', fetcher)
  
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [bloco, setBloco] = useState('')
  const [apartamento, setApartamento] = useState('')
  const [pagamento, setPagamento] = useState<TipoPagamento>('PIX')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomErro, setCupomErro] = useState('')
  const [descontoValor, setDescontoValor] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const freteBase = menuData?.freteBase ?? 500
  const freteRaioKm = menuData?.freteRaioKm ?? 3
  const freteKmExcedente = menuData?.freteKmExcedente ?? 100
  const frete = 0 // Sem taxa de entrega agora
  const total = Math.max(0, subtotal + frete - descontoValor)

  useEffect(() => {
    const profile = getCustomerProfile()
    if (!profile) return

    setNome(profile.nome)
    setTelefone(profile.telefone)
    setWhatsapp(profile.whatsapp)
    setBloco(profile.bloco)
    setApartamento(profile.apartamento)
  }, [])

  const formatTelefone = (value: string) => {
    const numeros = value.replace(/\D/g, '')
    if (numeros.length <= 2) return numeros
    if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`
  }

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatTelefone(e.target.value)
    setTelefone(formatted)
  }

  const handleAplicarCupom = async () => {
    setCupomErro('')
    setDescontoValor(0)

    const codigo = cupomCodigo.trim().toUpperCase()
    if (!codigo) {
      setCupomErro('Informe um cupom')
      return
    }

    try {
      const response = await fetch(`/api/cupons/validar?codigo=${encodeURIComponent(codigo)}&subtotal=${subtotal}`)
      const data = await response.json()
      if (!response.ok) {
        setCupomErro(data.error || 'Cupom invalido')
        return
      }
      setDescontoValor(data.descontoValor)
      setCupomCodigo(codigo)
    } catch {
      setCupomErro('Erro ao validar cupom')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!nome.trim()) {
      setError('Informe seu nome')
      return
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      setError('Informe um telefone válido')
      return
    }
    if (tipoEntrega === 'RESERVA_PAULISTANO') {
      if (!whatsapp.trim()) {
        setError('Informe um WhatsApp válido')
        return
      }
      if (!bloco.trim()) {
        setError('Informe o bloco')
        return
      }
      if (!apartamento.trim()) {
        setError('Informe o apartamento')
        return
      }
    }
    if (itens.length === 0) {
      setError('Seu carrinho está vazio')
      return
    }

    setIsSubmitting(true)

    try {
      saveCustomerProfile({
        nome: nome.trim(),
        telefone,
        whatsapp,
        bloco: bloco.trim(),
        apartamento: apartamento.trim()
      })

      const payload: CriarPedidoPayload = {
        clienteNome: nome.trim(),
        clienteTelefone: telefone.replace(/\D/g, ''),
        clienteWhatsapp: tipoEntrega === 'RESERVA_PAULISTANO' ? whatsapp.replace(/\D/g, '') : undefined,
        clienteBloco: tipoEntrega === 'RESERVA_PAULISTANO' ? bloco.trim() : undefined,
        clienteApartamento: tipoEntrega === 'RESERVA_PAULISTANO' ? apartamento.trim() : undefined,
        pagamento,
        tipoEntrega,
        cupomCodigo: cupomCodigo.trim() ? cupomCodigo.trim().toUpperCase() : undefined,
        itens: itens.map(item => ({
          produtoId: item.produto.id,
          quantidade: item.quantidade
        }))
      }

      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao criar pedido')
      }

      const pedido = await response.json()
      saveRecentOrder(pedido)

      if (pagamento === 'PIX' || pagamento === 'CARTAO') {
        const paymentResponse = await fetch('/api/pagamentos/mercado-pago/preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pedidoId: pedido.id })
        })
        const paymentData = await paymentResponse.json()

        if (!paymentResponse.ok) {
          throw new Error(paymentData.error || 'Erro ao iniciar pagamento')
        }

        limparCarrinho()
        window.location.href = paymentData.checkoutUrl
        return
      }

      limparCarrinho()
      router.push(`/confirmacao/${pedido.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (itens.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold mb-4">Carrinho vazio</h1>
        <p className="text-muted-foreground mb-6">Adicione itens antes de finalizar o pedido</p>
        <Button onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao menu
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Finalizar Pedido</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Resumo do Pedido */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map(item => (
              <div key={item.produto.id} className="flex justify-between text-sm">
                <span>
                  {item.quantidade}x {item.produto.nome}
                </span>
                <span className="font-medium">
                  {formatarMoeda(item.produto.preco * item.quantidade)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatarMoeda(subtotal)}</span>
            </div>
            {descontoValor > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Desconto</span>
                <span>-{formatarMoeda(descontoValor)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2">
              <span>Total</span>
              <span className="text-primary">{formatarMoeda(total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Dados do Cliente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Seus Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                placeholder="Seu nome completo"
                value={nome}
                onChange={e => setNome(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                placeholder="(00) 00000-0000"
                value={telefone}
                onChange={handleTelefoneChange}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Tipo de Entrega */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tipo de Entrega</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={tipoEntrega}
              onValueChange={(value) => setTipoEntrega(value as TipoEntrega)}
              className="space-y-3"
            >
              <label
                htmlFor="reserva"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  tipoEntrega === 'RESERVA_PAULISTANO' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="RESERVA_PAULISTANO" id="reserva" />
                <Truck className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Entrega Reserva Paulistano</p>
                  <p className="text-sm text-muted-foreground">
                    Entrega no condomínio
                  </p>
                </div>
              </label>

              <label
                htmlFor="retirada"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  tipoEntrega === 'RETIRADA' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="RETIRADA" id="retirada" />
                <Store className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Retirada</p>
                  <p className="text-sm text-muted-foreground">
                    {menuData?.enderecoRetirada || 'Carregando...'}
                  </p>
                </div>
              </label>
            </RadioGroup>

            {tipoEntrega === 'RESERVA_PAULISTANO' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    placeholder="(00) 00000-0000"
                    value={whatsapp}
                    onChange={handleTelefoneChange}
                    onFocus={(e) => {
                      const input = e.target
                      input.value = whatsapp
                      input.onChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
                        const formatted = formatTelefone(ev.target.value)
                        setWhatsapp(formatted)
                      }
                    }}
                    onChange={(e) => {
                      const formatted = formatTelefone(e.target.value)
                      setWhatsapp(formatted)
                    }}
                    required
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bloco">Bloco</Label>
                    <Input
                      id="bloco"
                      placeholder="Ex: A, B, C..."
                      value={bloco}
                      onChange={e => setBloco(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apartamento">Apartamento</Label>
                    <Input
                      id="apartamento"
                      placeholder="Ex: 101, 202..."
                      value={apartamento}
                      onChange={e => setApartamento(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Forma de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={pagamento}
              onValueChange={(value) => setPagamento(value as TipoPagamento)}
              className="space-y-3"
            >
              <label
                htmlFor="pix"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  pagamento === 'PIX' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="PIX" id="pix" />
                <QrCode className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">PIX</span>
              </label>

              <label
                htmlFor="cartao"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  pagamento === 'CARTAO' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="CARTAO" id="cartao" />
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Cartão</span>
              </label>

              <label
                htmlFor="dinheiro"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  pagamento === 'DINHEIRO' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="DINHEIRO" id="dinheiro" />
                <Banknote className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Dinheiro</span>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Cupom */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cupom de Desconto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Digite seu cupom"
                value={cupomCodigo}
                onChange={e => setCupomCodigo(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleAplicarCupom}>
                Aplicar
              </Button>
            </div>
            {cupomErro && (
              <p className="text-sm text-destructive">{cupomErro}</p>
            )}
            {descontoValor > 0 && (
              <p className="text-sm text-success">
                Cupom aplicado: -{formatarMoeda(descontoValor)}
              </p>
            )}
          </CardContent>
        </Card>
        {/* Error Message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <Button 
          type="submit" 
          className="w-full h-14 text-base"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            `Confirmar Pedido - ${formatarMoeda(total)}`
          )}
        </Button>
      </form>
    </div>
  )
}
