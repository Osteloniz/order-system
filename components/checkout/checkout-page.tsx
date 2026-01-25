'use client'

import React from "react"

import { useState } from 'react'
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
import { formatarMoeda, calcularFretePorDistancia } from '@/lib/calc'
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
  const [pagamento, setPagamento] = useState<TipoPagamento>('PIX')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('ENTREGA')
  const [cep, setCep] = useState('')
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [complemento, setComplemento] = useState('')
  const [cepError, setCepError] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null)
  const [distanciaManual, setDistanciaManual] = useState('')
  const [freteCalculado, setFreteCalculado] = useState<number | null>(null)
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomErro, setCupomErro] = useState('')
  const [descontoValor, setDescontoValor] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const freteBase = menuData?.freteBase ?? 500
  const freteRaioKm = menuData?.freteRaioKm ?? 3
  const freteKmExcedente = menuData?.freteKmExcedente ?? 100
  const frete = tipoEntrega === 'ENTREGA' ? (freteCalculado ?? 0) : 0
  const total = Math.max(0, subtotal + frete - descontoValor)

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

  const handleCepChange = async (value: string) => {
    const somenteNumeros = value.replace(/\D/g, '').slice(0, 8)
    setCep(somenteNumeros)
    setCepError('')

    if (somenteNumeros.length !== 8) {
      return
    }

    setCepLoading(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${somenteNumeros}/json/`)
      const data = await response.json()
      if (data.erro) {
        setCepError('CEP nao encontrado')
        return
      }
      setRua(data.logradouro || '')
      setBairro(data.bairro || '')
      setCidade(data.localidade || '')
      setUf(data.uf || '')
    } catch {
      setCepError('Erro ao buscar CEP')
    } finally {
      setCepLoading(false)
    }
  }

  const calcularFrete = (km: number) => {
    const valorFrete = calcularFretePorDistancia({
      distanciaKm: km,
      freteBase,
      freteRaioKm,
      freteKmExcedente
    })
    setFreteCalculado(valorFrete)
  }

  const handleDistanciaManual = (value: string) => {
    setDistanciaManual(value)
    const parsed = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed >= 0) {
      setDistanciaKm(parsed)
      calcularFrete(parsed)
    } else {
      setDistanciaKm(null)
      setFreteCalculado(null)
    }
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
    }    if (tipoEntrega === 'ENTREGA') {
      if (cep.length !== 8) {
        setError('Informe um CEP valido')
        return
      }
      if (!rua.trim() || !numero.trim() || !bairro.trim() || !cidade.trim() || !uf.trim()) {
        setError('Preencha o endereco completo')
        return
      }
    }
    if (tipoEntrega === 'ENTREGA' && (!distanciaKm || distanciaKm <= 0)) {
      setError('Informe a distancia para calcular o frete')
      return
    }
    if (itens.length === 0) {
      setError('Seu carrinho está vazio')
      return
    }

    setIsSubmitting(true)

    try {
      const enderecoEntrega = `${rua}, ${numero}${complemento ? ` - ${complemento}` : ''} - ${bairro}, ${cidade} - ${uf}, CEP ${cep}`
      const payload: CriarPedidoPayload = {
        clienteNome: nome.trim(),
        clienteTelefone: telefone.replace(/\D/g, ''),
        pagamento,
        tipoEntrega,
        enderecoEntrega: tipoEntrega === 'ENTREGA' ? enderecoEntrega : undefined,
        distanciaKm: tipoEntrega === 'ENTREGA' ? (distanciaKm ?? undefined) : undefined,
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
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
            {tipoEntrega === 'ENTREGA' && (
              <div className="flex justify-between text-sm">
                <span>Taxa de entrega</span>
                <span>{formatarMoeda(frete)}</span>
              </div>
            )}
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
            <CardTitle className="text-base">Entrega ou Retirada</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={tipoEntrega}
              onValueChange={(value) => setTipoEntrega(value as TipoEntrega)}
              className="space-y-3"
            >
              <label
                htmlFor="entrega"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  tipoEntrega === 'ENTREGA' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-secondary/50'
                }`}
              >
                <RadioGroupItem value="ENTREGA" id="entrega" />
                <Truck className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Entrega</p>
                  <p className="text-sm text-muted-foreground">
                    Receba em casa - a partir de {formatarMoeda(freteBase)}
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

            {tipoEntrega === 'ENTREGA' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    required
                  />
                  {cepLoading && (
                    <p className="text-xs text-muted-foreground">Buscando CEP...</p>
                  )}
                  {cepError && (
                    <p className="text-xs text-destructive">{cepError}</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rua">Rua</Label>
                    <Input
                      id="rua"
                      value={rua}
                      onChange={e => setRua(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="numero">Numero</Label>
                    <Input
                      id="numero"
                      value={numero}
                      onChange={e => setNumero(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bairro">Bairro</Label>
                    <Input
                      id="bairro"
                      value={bairro}
                      onChange={e => setBairro(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complemento">Complemento (opcional)</Label>
                    <Input
                      id="complemento"
                      value={complemento}
                      onChange={e => setComplemento(e.target.value)}
                      placeholder="Apartamento, bloco, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input
                      id="cidade"
                      value={cidade}
                      onChange={e => setCidade(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uf">UF</Label>
                    <Input
                      id="uf"
                      value={uf}
                      onChange={e => setUf(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="distancia">Distancia (km)</Label>
                  <Input
                    id="distancia"
                    value={distanciaManual}
                    onChange={(e) => handleDistanciaManual(e.target.value)}
                    placeholder="Ex: 7"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    O frete e calculado com base na distancia informada.
                  </p>
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
