'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CreditCard,
  Info,
  Loader2,
  LockKeyhole,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  Store,
  Truck,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCart } from '@/contexts/cart-context'
import { formatarMoeda } from '@/lib/calc'
import { getCustomerProfile, saveCustomerProfile, saveRecentOrder } from '@/lib/customer-session'
import { formatPhoneInput, isValidPhone, normalizePhone } from '@/lib/phone'
import type { CheckoutPublicoConfig, CriarPedidoPayload, PedidoPublico, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'

interface MenuData {
  estabelecimento: string
  enderecoRetirada: string
  freteBase: number
  freteRaioKm: number
  freteKmExcedente: number
  checkoutPublico: CheckoutPublicoConfig
  hasActiveCoupons: boolean
}

type ClientePrefillResponse = {
  found: boolean
  cliente?: {
    nome: string | null
    clienteBloco: string | null
    clienteApartamento: string | null
  }
}

type LookupState = 'idle' | 'loading' | 'found' | 'not-found' | 'error'
type ProfileSource = 'server' | 'device' | null

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function getEntregaTitle(tipoEntrega: TipoEntrega) {
  if (tipoEntrega === 'RETIRADA') return 'Retirada'
  if (tipoEntrega === 'ENCOMENDA') return 'Encomenda'
  return 'Reserva Paulistano'
}

function getFirstEnabledEntrega(config?: CheckoutPublicoConfig): TipoEntrega {
  if (config?.entregas.reservaPaulistano ?? true) return 'RESERVA_PAULISTANO'
  if (config?.entregas.retirada ?? true) return 'RETIRADA'
  return 'ENCOMENDA'
}

function getFirstEnabledPagamento(config?: CheckoutPublicoConfig): TipoPagamento {
  if (config?.pagamentos.pix ?? true) return 'PIX'
  if (config?.pagamentos.cartao ?? true) return 'CARTAO'
  return 'DINHEIRO'
}

export function CheckoutPage() {
  const router = useRouter()
  const { itens, subtotal, limparCarrinho } = useCart()
  const { data: menuData } = useSWR<MenuData>('/api/menu', fetcher)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [bloco, setBloco] = useState('')
  const [apartamento, setApartamento] = useState('')
  const [encomendaData, setEncomendaData] = useState('')
  const [encomendaHora, setEncomendaHora] = useState('')
  const [pagamento, setPagamento] = useState<TipoPagamento>('PIX')
  const [tipoCartao, setTipoCartao] = useState<TipoCartao>('CREDITO')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomErro, setCupomErro] = useState('')
  const [descontoValor, setDescontoValor] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [profileSource, setProfileSource] = useState<ProfileSource>(null)
  const lookupRequestRef = useRef(0)
  const prefilledPhoneRef = useRef('')

  const frete = 0
  const total = Math.max(0, subtotal + frete - descontoValor)
  const totalItens = itens.reduce((acc, item) => acc + item.quantidade, 0)
  const checkoutConfig = menuData?.checkoutPublico
  const entregaReservaDisponivel = checkoutConfig?.entregas.reservaPaulistano ?? true
  const entregaRetiradaDisponivel = checkoutConfig?.entregas.retirada ?? true
  const entregaEncomendaDisponivel = checkoutConfig?.entregas.encomenda ?? true
  const pagamentoPixDisponivel = checkoutConfig?.pagamentos.pix ?? true
  const pagamentoDinheiroDisponivel = checkoutConfig?.pagamentos.dinheiro ?? true
  const pagamentoCartaoDisponivel = checkoutConfig?.pagamentos.cartao ?? true
  const cartaoCreditoDisponivel = checkoutConfig?.pagamentos.cartaoCredito ?? true
  const cartaoDebitoDisponivel = checkoutConfig?.pagamentos.cartaoDebito ?? true
  const pagamentoUiValue =
    pagamento === 'CARTAO'
      ? (tipoCartao === 'DEBITO' ? 'CARTAO_DEBITO' : 'CARTAO_CREDITO')
      : pagamento

  useEffect(() => {
    if (!checkoutConfig) return

    const entregaAtualHabilitada =
      (tipoEntrega === 'RESERVA_PAULISTANO' && checkoutConfig.entregas.reservaPaulistano) ||
      (tipoEntrega === 'RETIRADA' && checkoutConfig.entregas.retirada) ||
      (tipoEntrega === 'ENCOMENDA' && checkoutConfig.entregas.encomenda)

    if (!entregaAtualHabilitada) {
      setTipoEntrega(getFirstEnabledEntrega(checkoutConfig))
    }

    const pagamentoAtualHabilitado =
      (pagamento === 'PIX' && checkoutConfig.pagamentos.pix) ||
      (pagamento === 'DINHEIRO' && checkoutConfig.pagamentos.dinheiro) ||
      (pagamento === 'CARTAO' && checkoutConfig.pagamentos.cartao)

    if (!pagamentoAtualHabilitado) {
      setPagamento(getFirstEnabledPagamento(checkoutConfig))
    }

    if (checkoutConfig.pagamentos.cartao) {
      if (!checkoutConfig.pagamentos.cartaoCredito && checkoutConfig.pagamentos.cartaoDebito) {
        setTipoCartao('DEBITO')
      } else if (checkoutConfig.pagamentos.cartaoCredito && !checkoutConfig.pagamentos.cartaoDebito) {
        setTipoCartao('CREDITO')
      }
    }
  }, [checkoutConfig, pagamento, tipoEntrega])

  useEffect(() => {
    const telefoneNormalizado = normalizePhone(telefone)

    if (!telefoneNormalizado || !isValidPhone(telefoneNormalizado)) {
      if (prefilledPhoneRef.current && prefilledPhoneRef.current !== telefoneNormalizado) {
        setNome('')
        setWhatsapp('')
        setBloco('')
        setApartamento('')
        setProfileSource(null)
        prefilledPhoneRef.current = ''
      }
      setLookupState('idle')
      return
    }

    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId
    setLookupState('loading')

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/clientes/prefill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefone: telefoneNormalizado }),
        })
        const data = (await response.json().catch(() => null)) as ClientePrefillResponse | null

        if (lookupRequestRef.current !== requestId) return

        if (!response.ok || !data) {
          setLookupState('error')
          return
        }

        if (!data.found || !data.cliente) {
          const localProfile = getCustomerProfile(telefoneNormalizado)
          if (localProfile) {
            setNome(localProfile.nome || '')
            setWhatsapp(formatPhoneInput(localProfile.whatsapp || telefoneNormalizado))
            setBloco(localProfile.bloco || '')
            setApartamento(localProfile.apartamento || '')
            setProfileSource('device')
            prefilledPhoneRef.current = telefoneNormalizado
          } else if (prefilledPhoneRef.current !== telefoneNormalizado) {
            setNome('')
            setWhatsapp('')
            setBloco('')
            setApartamento('')
            setProfileSource(null)
            prefilledPhoneRef.current = ''
          }
          setLookupState('not-found')
          return
        }

        setNome(data.cliente.nome || '')
        setWhatsapp(formatPhoneInput(telefoneNormalizado))
        setBloco(data.cliente.clienteBloco || '')
        setApartamento(data.cliente.clienteApartamento || '')
        setProfileSource('server')
        prefilledPhoneRef.current = telefoneNormalizado
        setLookupState('found')
      } catch {
        if (lookupRequestRef.current === requestId) {
          setLookupState('error')
        }
      }
    }, 320)

    return () => window.clearTimeout(timeoutId)
  }, [telefone])

  const handleTelefoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTelefone(formatPhoneInput(event.target.value))
  }

  const nomeTravado = profileSource === 'server' && lookupState === 'found'
  const lookupFeedback = (() => {
    switch (lookupState) {
      case 'loading':
        return {
          tone: 'border-border/70 bg-muted/20 text-muted-foreground',
          text: 'Estamos procurando seu cadastro para agilizar o preenchimento.',
        }
      case 'found':
        return {
          tone: 'border-success/25 bg-success/10 text-success',
          text: 'Cadastro encontrado. Preenchemos seus dados e protegemos o nome para manter seu histórico consistente.',
        }
      case 'not-found':
        return {
          tone: 'border-primary/20 bg-primary/[0.06] text-muted-foreground',
          text: 'Ainda não encontramos esse número. Continue preenchendo normalmente e salvaremos seu cadastro ao concluir o pedido.',
        }
      case 'error':
        return {
          tone: 'border-border/70 bg-muted/20 text-muted-foreground',
          text: 'Não foi possível consultar o cadastro agora, mas você pode concluir o pedido normalmente.',
        }
      default:
        return null
    }
  })()

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
        setCupomErro(data.error || 'Cupom inválido')
        return
      }
      setDescontoValor(data.descontoValor)
      setCupomCodigo(codigo)
    } catch {
      setCupomErro('Erro ao validar cupom')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!isValidPhone(telefone)) {
      setError('Informe um telefone valido')
      return
    }
    if (!nome.trim()) {
      setError('Informe seu nome')
      return
    }
    if (tipoEntrega === 'RESERVA_PAULISTANO' && !bloco.trim()) {
      setError('Informe o bloco')
      return
    }
    if (tipoEntrega === 'RESERVA_PAULISTANO' && !apartamento.trim()) {
      setError('Informe o apartamento')
      return
    }
    if (tipoEntrega === 'ENCOMENDA' && (!encomendaData || !encomendaHora)) {
      if ((checkoutConfig?.encomenda.modo ?? 'CLIENTE_DEFINE') === 'CLIENTE_DEFINE') {
        setError('Informe a data e a hora da encomenda')
        return
      }
    }
    if (itens.length === 0) {
      setError('Seu carrinho esta vazio')
      return
    }

    setIsSubmitting(true)

    try {
      const whatsappContato = formatPhoneInput(whatsapp) || telefone

      saveCustomerProfile({
        nome: nome.trim(),
        telefone,
        whatsapp: whatsappContato,
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
      })

      const payload: CriarPedidoPayload = {
        clienteNome: nome.trim(),
        clienteTelefone: normalizePhone(telefone),
        clienteWhatsapp: normalizePhone(whatsappContato) || normalizePhone(telefone),
        clienteBloco: tipoEntrega === 'RESERVA_PAULISTANO' ? bloco.trim() : undefined,
        clienteApartamento: tipoEntrega === 'RESERVA_PAULISTANO' ? apartamento.trim() : undefined,
        pagamento,
        tipoCartao: pagamento === 'CARTAO' ? tipoCartao : undefined,
        tipoEntrega,
        encomendaPara: tipoEntrega === 'ENCOMENDA' && (checkoutConfig?.encomenda.modo ?? 'CLIENTE_DEFINE') === 'CLIENTE_DEFINE'
          ? `${encomendaData}T${encomendaHora}:00-03:00`
          : undefined,
        cupomCodigo: cupomCodigo.trim() ? cupomCodigo.trim().toUpperCase() : undefined,
        itens: itens.map((item) => ({
          produtoId: item.produto.id,
          quantidade: item.quantidade,
        })),
      }

      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao criar pedido')
      }

      const pedido = (await response.json()) as PedidoPublico
      saveRecentOrder({ ...pedido, accessToken: pedido.publicAccessToken || null })
      limparCarrinho()
      const confirmationUrl = pedido.publicAccessToken
        ? `/confirmacao/${pedido.id}?token=${encodeURIComponent(pedido.publicAccessToken)}`
        : `/confirmacao/${pedido.id}`
      router.push(confirmationUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (itens.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <h1 className="text-xl font-bold">Carrinho vazio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Adicione itens antes de finalizar o pedido.</p>
        <Button className="mt-6 h-11 rounded-2xl" onClick={() => router.push('/menu')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao menu
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/96 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => router.push('/menu')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-primary">Pedido online</p>
            <h1 className="text-lg font-bold">Finalizar pedido</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/16 via-background to-secondary/16 p-5 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-lg">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <PackageCheck className="h-3.5 w-3.5" />
                Confirmação rápida
              </div>
              <h2 className="mt-3 text-2xl font-bold">{menuData?.estabelecimento || 'Seu pedido'}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Informe seu telefone para puxarmos seus dados cadastrados e concluir o pedido mais rápido.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
              <div className="rounded-2xl border bg-background/82 p-4">
                <p className="text-xs text-muted-foreground">Itens</p>
                <p className="mt-1 text-2xl font-bold">{totalItens}</p>
              </div>
              <div className="rounded-2xl border bg-background/82 p-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="mt-1 text-2xl font-bold text-primary">{formatarMoeda(total)}</p>
              </div>
            </div>
          </div>
        </section>

        <Card className="border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo do pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((item) => (
              <div key={item.produto.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  {item.quantidade}x {item.produto.nome}
                </span>
                <span className="shrink-0 font-medium">{formatarMoeda(item.produto.preco * item.quantidade)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatarMoeda(subtotal)}</span>
            </div>
            {descontoValor > 0 ? (
              <div className="flex justify-between text-sm text-success">
                <span>Desconto</span>
                <span>-{formatarMoeda(descontoValor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatarMoeda(total)}</span>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-5 w-5 text-primary" />
                Identificação e contato
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Comece pelo seu telefone principal. Ele é a chave para encontrarmos seu cadastro, evitar duplicidade e contabilizar a fidelidade no cliente certo.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-secondary/[0.08] p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full border border-primary/15 bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    Obrigatório
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-primary/20 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                    Vale para fidelidade
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        aria-label="Como usamos seu telefone"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={8} className="max-w-[260px] rounded-2xl px-3 py-2 text-[12px] leading-5">
                      Use o mesmo número do seu WhatsApp. Se ele já estiver cadastrado, o sistema puxa seus dados e contabiliza a fidelidade no cliente correto.
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="telefone" className="text-sm font-semibold">
                      Telefone principal do pedido
                    </Label>
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/85">
                      Campo essencial
                    </span>
                  </div>
                  <Input
                    id="telefone"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={handleTelefoneChange}
                    className="h-12 rounded-2xl border-primary/20 bg-background/90 text-base shadow-sm"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    aria-describedby="telefone-helper telefone-status"
                  />
                  <div id="telefone-helper" className="flex items-start gap-2 rounded-2xl border border-border/70 bg-background/75 px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p>
                      Esse número é obrigatório porque identifica seu cadastro, acelera o preenchimento e mantém a fidelidade no cliente certo.
                    </p>
                  </div>
                  {lookupFeedback ? (
                    <div
                      id="telefone-status"
                      aria-live="polite"
                      className={`flex items-start gap-2 rounded-2xl border px-3 py-3 text-xs leading-5 ${lookupFeedback.tone}`}
                    >
                      {lookupState === 'loading' ? (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : lookupState === 'found' ? (
                        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <p>{lookupFeedback.text}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={`space-y-3 rounded-[24px] border p-4 shadow-sm transition-colors ${
                nomeTravado ? 'border-success/20 bg-success/[0.04]' : 'border-border/70 bg-background/60'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="nome" className="text-sm font-semibold">
                    Nome
                  </Label>
                  {nomeTravado ? (
                    <Badge variant="outline" className="rounded-full border-success/25 bg-success/10 px-2.5 py-1 text-[11px] text-success">
                      Preenchido pelo cadastro
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Confirme seu nome
                    </span>
                  )}
                </div>
                <Input
                  id="nome"
                  placeholder="Seu nome completo"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  className={`h-12 rounded-2xl text-base shadow-sm ${
                    nomeTravado ? 'border-success/20 bg-muted/30 text-muted-foreground' : 'border-border/80 bg-background/90'
                  }`}
                  readOnly={nomeTravado}
                  aria-readonly={nomeTravado}
                  autoComplete="name"
                  required
                />
                {nomeTravado ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-success/20 bg-background/70 px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    <p>Esse nome veio do cadastro encontrado para esse número. Se precisar corrigir, a loja pode ajustar depois.</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p>Preencha como você gostaria de aparecer no pedido e no histórico de compras.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-5 w-5 text-primary" />
                Tipo de entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup value={tipoEntrega} onValueChange={(value) => setTipoEntrega(value as TipoEntrega)} className="space-y-3">
                {entregaReservaDisponivel ? (
                  <label
                    htmlFor="reserva"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      tipoEntrega === 'RESERVA_PAULISTANO' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value="RESERVA_PAULISTANO" id="reserva" />
                    <Truck className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Reserva Paulistano</p>
                      <p className="text-sm text-muted-foreground">Entrega no condomínio.</p>
                    </div>
                  </label>
                ) : null}

                {entregaRetiradaDisponivel ? (
                  <label
                    htmlFor="retirada"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      tipoEntrega === 'RETIRADA' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value="RETIRADA" id="retirada" />
                    <Store className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Retirada</p>
                      <p className="text-sm text-muted-foreground">{menuData?.enderecoRetirada || 'Carregando endereço...'}</p>
                    </div>
                  </label>
                ) : null}

                {entregaEncomendaDisponivel ? (
                  <label
                    htmlFor="encomenda"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      tipoEntrega === 'ENCOMENDA' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value="ENCOMENDA" id="encomenda" />
                    <PackageCheck className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Encomenda</p>
                      <p className="text-sm text-muted-foreground">
                        {(checkoutConfig?.encomenda.modo ?? 'CLIENTE_DEFINE') === 'FIXO'
                          ? 'A data desta encomenda ja foi definida pela loja.'
                          : 'Agende data e hora para prepararmos seu pedido.'}
                      </p>
                    </div>
                  </label>
                ) : null}
              </RadioGroup>

              {tipoEntrega === 'RESERVA_PAULISTANO' ? (
                <div className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bloco">Bloco</Label>
                    <Input
                      id="bloco"
                      placeholder="Ex: A, B, C"
                      value={bloco}
                      onChange={(event) => setBloco(event.target.value)}
                      className="h-11 rounded-2xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apartamento">Apartamento</Label>
                    <Input
                      id="apartamento"
                      placeholder="Ex: 101, 202"
                      value={apartamento}
                      onChange={(event) => setApartamento(event.target.value)}
                      className="h-11 rounded-2xl"
                      required
                    />
                  </div>
                </div>
              ) : null}

              {tipoEntrega === 'RETIRADA' ? (
                <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>Você retira no endereço configurado pela loja. O número informado acima continua sendo o contato principal do pedido.</p>
                </div>
              ) : null}

              {tipoEntrega === 'ENCOMENDA' ? (
                (checkoutConfig?.encomenda.modo ?? 'CLIENTE_DEFINE') === 'FIXO' ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      Esta encomenda sera registrada para{' '}
                      <strong className="text-foreground">
                        {checkoutConfig?.encomenda.dataFixa
                          ? new Date(checkoutConfig.encomenda.dataFixa).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                          : 'a data definida pela loja'}
                      </strong>.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="encomenda-data">Data da encomenda</Label>
                      <Input
                        id="encomenda-data"
                        type="date"
                        value={encomendaData}
                        onChange={(event) => setEncomendaData(event.target.value)}
                        className="h-11 rounded-2xl"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="encomenda-hora">Hora da encomenda</Label>
                      <Input
                        id="encomenda-hora"
                        type="time"
                        value={encomendaHora}
                        onChange={(event) => setEncomendaHora(event.target.value)}
                        className="h-11 rounded-2xl"
                        required
                      />
                    </div>
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-5 w-5 text-primary" />
                Pagamento para controle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                Informe apenas o método usado como referência. A combinação e a efetivação do pagamento acontecem fora do site.
              </div>

              <RadioGroup
                value={pagamentoUiValue}
                onValueChange={(value) => {
                  if (value === 'PIX') {
                    setPagamento('PIX')
                    return
                  }
                  if (value === 'DINHEIRO') {
                    setPagamento('DINHEIRO')
                    return
                  }
                  if (value === 'CARTAO_CREDITO') {
                    setPagamento('CARTAO')
                    setTipoCartao('CREDITO')
                    return
                  }
                  if (value === 'CARTAO_DEBITO') {
                    setPagamento('CARTAO')
                    setTipoCartao('DEBITO')
                  }
                }}
                className="space-y-3"
              >
                {pagamentoPixDisponivel ? (
                  <label
                    htmlFor="pix"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      pagamento === 'PIX' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value="PIX" id="pix" />
                    <QrCode className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">PIX</p>
                      <p className="text-sm text-muted-foreground">Referencia operacional para o atendimento.</p>
                    </div>
                  </label>
                ) : null}

                {pagamentoDinheiroDisponivel ? (
                  <label
                    htmlFor="dinheiro"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      pagamento === 'DINHEIRO' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value="DINHEIRO" id="dinheiro" />
                    <Banknote className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Dinheiro</p>
                      <p className="text-sm text-muted-foreground">Pagamento combinado diretamente na entrega ou retirada.</p>
                    </div>
                  </label>
                ) : null}

                {pagamentoCartaoDisponivel && cartaoCreditoDisponivel ? (
                  <label
                    htmlFor="cartao-credito"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      pagamento === 'CARTAO' && tipoCartao === 'CREDITO' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem
                      value="CARTAO_CREDITO"
                      id="cartao-credito"
                    />
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Cartão crédito</p>
                      <p className="text-sm text-muted-foreground">Usado apenas como identificação da forma de pagamento.</p>
                    </div>
                  </label>
                ) : null}

                {pagamentoCartaoDisponivel && cartaoDebitoDisponivel ? (
                  <label
                    htmlFor="cartao-debito"
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] border p-4 transition-colors ${
                      pagamento === 'CARTAO' && tipoCartao === 'DEBITO' ? 'border-primary/80 bg-primary/[0.08] shadow-sm' : 'border-border/90 bg-card hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem
                      value="CARTAO_DEBITO"
                      id="cartao-debito"
                    />
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Cartão débito</p>
                      <p className="text-sm text-muted-foreground">Usado apenas como identificação da forma de pagamento.</p>
                    </div>
                  </label>
                ) : null}
              </RadioGroup>
            </CardContent>
          </Card>

          {menuData?.hasActiveCoupons ? (
            <Card className="border-border/70 bg-card/95">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cupom de desconto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Digite seu cupom"
                    value={cupomCodigo}
                    onChange={(event) => setCupomCodigo(event.target.value)}
                    className="h-11 rounded-2xl"
                  />
                  <Button type="button" variant="outline" className="h-11 rounded-2xl sm:w-auto" onClick={handleAplicarCupom}>
                    Aplicar
                  </Button>
                </div>
                {cupomErro ? <p className="text-sm text-destructive">{cupomErro}</p> : null}
                {descontoValor > 0 ? <p className="text-sm text-success">Cupom aplicado: -{formatarMoeda(descontoValor)}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="h-14 w-full rounded-2xl text-base" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Enviando pedido...
              </>
            ) : (
              `Confirmar ${getEntregaTitle(tipoEntrega)} - ${formatarMoeda(total)}`
            )}
          </Button>
        </form>
      </main>
    </div>
  )
}
