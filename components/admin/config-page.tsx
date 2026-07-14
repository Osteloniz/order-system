'use client'

import React from "react"

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, CalendarClock, Copy, CreditCard, Link2, MapPin, MessageCircle, PackageCheck, QrCode, RotateCcw, Save, Loader2, Settings, Shield, Sparkles, Store, Volume2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getAdminAlertSoundEnabled, getAdminAlertsEnabled, getNotificationPermission, setAdminAlertSoundEnabled, setAdminAlertsEnabled } from '@/lib/admin-alert-settings'
import type { Configuracao, ModoEncomendaCheckout, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'
import { getDefaultStatusTemplate, hydrateConfigWithMessageDefaults, statusMessageTemplateFields, supportedStatusTemplateVariables } from '@/lib/message-templates'

function formatDateInputValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const body = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const errorMessage = typeof body === 'object' && body && 'error' in body ? String(body.error) : `Erro ao carregar ${url}`
    throw new Error(errorMessage)
  }

  return body as T
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text ? { error: text } : {}
}

export function ConfigPage() {
  const { data: rawConfig, error: configError, isLoading } = useSWR<Configuracao>('/api/admin/config', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: tenantData, error: tenantError } = useSWR<{ isOpen: boolean; slug?: string; nome?: string }>('/api/admin/tenant', fetcher, {
    revalidateOnFocus: false,
  })
  const config = rawConfig ? hydrateConfigWithMessageDefaults(rawConfig) : null

  const [nomeEstabelecimento, setNomeEstabelecimento] = useState('')
  const [enderecoRetirada, setEnderecoRetirada] = useState('')
  const [envioAutomaticoWhatsappStatus, setEnvioAutomaticoWhatsappStatus] = useState(true)
  const [padraoNovoPedidoEntrega, setPadraoNovoPedidoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [padraoNovoPedidoPagamento, setPadraoNovoPedidoPagamento] = useState<TipoPagamento>('DINHEIRO')
  const [padraoNovoPedidoTipoCartao, setPadraoNovoPedidoTipoCartao] = useState<TipoCartao>('CREDITO')
  const [padraoNovoPedidoDescontosExpandidos, setPadraoNovoPedidoDescontosExpandidos] = useState(false)
  const [padraoNovoPedidoObservacoesExpandidas, setPadraoNovoPedidoObservacoesExpandidas] = useState(false)
  const [padraoNovoPedidoResponsavelExpandido, setPadraoNovoPedidoResponsavelExpandido] = useState(false)
  const [checkoutPublicoEntregaReservaPaulistano, setCheckoutPublicoEntregaReservaPaulistano] = useState(true)
  const [checkoutPublicoEntregaRetirada, setCheckoutPublicoEntregaRetirada] = useState(true)
  const [checkoutPublicoEntregaEncomenda, setCheckoutPublicoEntregaEncomenda] = useState(true)
  const [checkoutPublicoEncomendaModo, setCheckoutPublicoEncomendaModo] = useState<ModoEncomendaCheckout>('CLIENTE_DEFINE')
  const [checkoutPublicoEncomendaDataFixa, setCheckoutPublicoEncomendaDataFixa] = useState('')
  const [checkoutPublicoPagamentoPix, setCheckoutPublicoPagamentoPix] = useState(true)
  const [checkoutPublicoPagamentoDinheiro, setCheckoutPublicoPagamentoDinheiro] = useState(true)
  const [checkoutPublicoPagamentoCartao, setCheckoutPublicoPagamentoCartao] = useState(true)
  const [checkoutPublicoPagamentoCartaoCredito, setCheckoutPublicoPagamentoCartaoCredito] = useState(true)
  const [checkoutPublicoPagamentoCartaoDebito, setCheckoutPublicoPagamentoCartaoDebito] = useState(true)
  const [mensagemStatusAceito, setMensagemStatusAceito] = useState('')
  const [mensagemStatusPreparacao, setMensagemStatusPreparacao] = useState('')
  const [mensagemStatusEntregue, setMensagemStatusEntregue] = useState('')
  const [isOpen, setIsOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [alertsEnabled, setAlertsEnabledState] = useState(false)
  const [soundEnabled, setSoundEnabledState] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState('unsupported')
  const [alertMessage, setAlertMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const configHydratedRef = useRef(false)
  const tenantHydratedRef = useRef(false)
  const publicCatalogUrl = baseUrl || '/'
  const adminLoginUrl = baseUrl ? `${baseUrl}/admin/login` : '/admin/login'
  const permissionLabel = notificationPermission === 'granted' ? 'permitida' : notificationPermission === 'denied' ? 'bloqueada' : notificationPermission === 'default' ? 'pendente' : 'nao suportada'
  const permissionTone = notificationPermission === 'granted' ? 'border-success/25 bg-success/10 text-success' : notificationPermission === 'denied' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-warning/25 bg-warning/10 text-warning-foreground'

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setAlertMessage(successMessage)
    } catch {
      setAlertMessage('Não foi possível copiar automaticamente. Você ainda pode copiar manualmente.')
    }
  }

  const playTestSound = () => {
    const AudioContextConstructor = window.AudioContext || (window as typeof window & {
      webkitAudioContext: typeof AudioContext
    }).webkitAudioContext
    const audioContext = new AudioContextConstructor()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(920, audioContext.currentTime)
    gain.gain.setValueAtTime(0.001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.36)
  }

  useEffect(() => {
    if (config && (!configHydratedRef.current || !isDirty)) {
      setNomeEstabelecimento(config.nomeEstabelecimento)
      setEnderecoRetirada(config.enderecoRetirada)
      setEnvioAutomaticoWhatsappStatus(config.envioAutomaticoWhatsappStatus)
      setPadraoNovoPedidoEntrega(config.padraoNovoPedidoEntrega ?? 'RESERVA_PAULISTANO')
      setPadraoNovoPedidoPagamento(config.padraoNovoPedidoPagamento ?? 'DINHEIRO')
      setPadraoNovoPedidoTipoCartao(config.padraoNovoPedidoTipoCartao ?? 'CREDITO')
      setPadraoNovoPedidoDescontosExpandidos(config.padraoNovoPedidoDescontosExpandidos ?? false)
      setPadraoNovoPedidoObservacoesExpandidas(config.padraoNovoPedidoObservacoesExpandidas ?? false)
      setPadraoNovoPedidoResponsavelExpandido(config.padraoNovoPedidoResponsavelExpandido ?? false)
      setCheckoutPublicoEntregaReservaPaulistano(config.checkoutPublicoEntregaReservaPaulistano ?? true)
      setCheckoutPublicoEntregaRetirada(config.checkoutPublicoEntregaRetirada ?? true)
      setCheckoutPublicoEntregaEncomenda(config.checkoutPublicoEntregaEncomenda ?? true)
      setCheckoutPublicoEncomendaModo(config.checkoutPublicoEncomendaModo ?? 'CLIENTE_DEFINE')
      setCheckoutPublicoEncomendaDataFixa(formatDateInputValue(config.checkoutPublicoEncomendaDataFixa))
      setCheckoutPublicoPagamentoPix(config.checkoutPublicoPagamentoPix ?? true)
      setCheckoutPublicoPagamentoDinheiro(config.checkoutPublicoPagamentoDinheiro ?? true)
      setCheckoutPublicoPagamentoCartao(config.checkoutPublicoPagamentoCartao ?? true)
      setCheckoutPublicoPagamentoCartaoCredito(config.checkoutPublicoPagamentoCartaoCredito ?? true)
      setCheckoutPublicoPagamentoCartaoDebito(config.checkoutPublicoPagamentoCartaoDebito ?? true)
      setMensagemStatusAceito(config.mensagemStatusAceito)
      setMensagemStatusPreparacao(config.mensagemStatusPreparacao)
      setMensagemStatusEntregue(config.mensagemStatusEntregue)
      configHydratedRef.current = true
    }
  }, [config, isDirty])

  useEffect(() => {
    if (tenantData && typeof tenantData.isOpen === 'boolean' && (!tenantHydratedRef.current || !isDirty)) {
      setIsOpen(tenantData.isOpen)
      tenantHydratedRef.current = true
    }
  }, [tenantData, isDirty])

  useEffect(() => {
    setAlertsEnabledState(getAdminAlertsEnabled())
    setSoundEnabledState(getAdminAlertSoundEnabled())
    setNotificationPermission(getNotificationPermission())
  }, [])

  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  const handleToggleAlerts = async (enabled: boolean) => {
    let permission = getNotificationPermission()
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      permission = await Notification.requestPermission()
    }

    setNotificationPermission(permission)
    setAdminAlertsEnabled(enabled)
    setAlertsEnabledState(enabled)
    setAlertMessage(
      permission === 'denied'
        ? 'Notificacoes bloqueadas no navegador. Libere nas configuracoes do site/navegador.'
        : enabled
          ? 'Alertas habilitados neste navegador.'
          : 'Alertas desabilitados neste navegador.'
    )
  }

  const handleToggleSound = (enabled: boolean) => {
    setAdminAlertSoundEnabled(enabled)
    setSoundEnabledState(enabled)
    setAlertMessage(enabled ? 'Som de alerta habilitado.' : 'Som de alerta desabilitado.')
    if (enabled) playTestSound()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSaved(false)
    setSubmitError('')

    const payload: Record<string, number | string | boolean | null> = {
      nomeEstabelecimento,
      enderecoRetirada,
      envioAutomaticoWhatsappStatus,
      padraoNovoPedidoEntrega,
      padraoNovoPedidoPagamento,
      padraoNovoPedidoTipoCartao: padraoNovoPedidoPagamento === 'CARTAO' ? padraoNovoPedidoTipoCartao : null,
      padraoNovoPedidoDescontosExpandidos,
      padraoNovoPedidoObservacoesExpandidas,
      padraoNovoPedidoResponsavelExpandido,
      checkoutPublicoEntregaReservaPaulistano,
      checkoutPublicoEntregaRetirada,
      checkoutPublicoEntregaEncomenda,
      checkoutPublicoEncomendaModo,
      checkoutPublicoEncomendaDataFixa: checkoutPublicoEntregaEncomenda && checkoutPublicoEncomendaModo === 'FIXO' && checkoutPublicoEncomendaDataFixa
        ? new Date(`${checkoutPublicoEncomendaDataFixa}T00:00:00-03:00`).toISOString()
        : null,
      checkoutPublicoPagamentoPix,
      checkoutPublicoPagamentoDinheiro,
      checkoutPublicoPagamentoCartao,
      checkoutPublicoPagamentoCartaoCredito,
      checkoutPublicoPagamentoCartaoDebito,
      mensagemStatusAceito: mensagemStatusAceito.trim(),
      mensagemStatusPreparacao: mensagemStatusPreparacao.trim(),
      mensagemStatusEntregue: mensagemStatusEntregue.trim()
    }

    try {
      const configResponse = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const updatedConfig = await readResponseBody(configResponse)

      const tenantResponse = await fetch('/api/admin/tenant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen })
      })
      const updatedTenant = await readResponseBody(tenantResponse)

      const errors: string[] = []

      if (configResponse.ok) {
        mutate('/api/admin/config', updatedConfig, false)
      } else {
        errors.push(
          typeof updatedConfig === 'object' && updatedConfig && 'error' in updatedConfig
            ? `Configurações: ${String(updatedConfig.error)}`
            : 'Configurações: erro ao salvar configurações'
        )
      }

      if (tenantResponse.ok) {
        mutate('/api/admin/tenant', updatedTenant, false)
      } else {
        errors.push(
          typeof updatedTenant === 'object' && updatedTenant && 'error' in updatedTenant
            ? `Loja: ${String(updatedTenant.error)}`
            : 'Loja: erro ao atualizar status da loja'
        )
      }

      if (errors.length > 0) {
        throw new Error(errors.join(' | '))
      }

      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao salvar configurações')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading && !config && !configError) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/18 via-background to-secondary/16 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="mb-3 bg-primary/90 text-primary-foreground hover:bg-primary/90">
              <Sparkles className="mr-1 h-3 w-3" /> Ajustes do painel
            </Badge>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Settings className="h-7 w-7 text-primary" />
              Configurações
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Centralize os dados do estabelecimento, textos do WhatsApp, links de operação e alertas deste navegador.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">Loja</p>
              <p className="mt-1 font-semibold">{nomeEstabelecimento || 'Não configurado'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isOpen ? 'Aberta para pedidos' : 'Fechada no checkout'}</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">Alertas</p>
              <p className="mt-1 font-semibold">{alertsEnabled ? 'Ativos' : 'Desativados'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Permissao {permissionLabel}</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">Mensagens</p>
              <p className="mt-1 font-semibold">{envioAutomaticoWhatsappStatus ? 'Envio automático ligado' : 'Envio manual'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Fluxo de status do pedido</p>
            </div>
          </div>
        </div>
      </div>

      {(configError || tenantError) && (
        <Card className="max-w-4xl border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {(configError || tenantError)?.message || 'Não foi possível carregar as configurações.'}
          </CardContent>
        </Card>
      )}

      <Card className="max-w-6xl overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Dados do Estabelecimento
          </CardTitle>
          <CardDescription>
            Ajuste o nome exibido, o endereço de retirada e o comportamento geral da loja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="min-w-0 space-y-4 rounded-2xl border border-border/70 bg-background/65 p-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Estabelecimento</Label>
                  <Input
                    id="nome"
                    value={nomeEstabelecimento}
                    onChange={e => {
                      setNomeEstabelecimento(e.target.value)
                      setIsDirty(true)
                    }}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endereco">Endereço para Retirada</Label>
                  <Input
                    id="endereco"
                    value={enderecoRetirada}
                    onChange={e => {
                      setEnderecoRetirada(e.target.value)
                      setIsDirty(true)
                    }}
                    required
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-background/65 p-4">
                <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label htmlFor="aberto">Aberto para pedidos</Label>
                    <p className="text-xs text-muted-foreground">
                      Quando fechado, o cliente não consegue finalizar pedidos.
                    </p>
                  </div>
                  <Switch
                    id="aberto"
                    checked={isOpen}
                    onCheckedChange={(value) => {
                      setIsOpen(value)
                      setIsDirty(true)
                    }}
                  />
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Estado atual da loja</p>
                      <p className="mt-1 text-muted-foreground">{isOpen ? 'Checkout liberado para clientes.' : 'Checkout bloqueado ate reabrir a loja.'}</p>
                    </div>
                    <Badge variant="outline" className={isOpen ? 'border-success/25 bg-success/10 text-success' : 'border-warning/25 bg-warning/10 text-warning-foreground'}>
                      {isOpen ? 'Aberta' : 'Fechada'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/65 p-4">
              <div className="mb-4">
                <Label className="text-base">Padrão para novos pedidos manuais</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Define entrega, pagamento e cards expandidos por padrão ao abrir a tela de novo pedido no admin.
                </p>
              </div>
              <div className="mb-5">
                <p className="text-sm font-medium">Entrega inicial</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPadraoNovoPedidoEntrega('RESERVA_PAULISTANO')
                      setIsDirty(true)
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoEntrega === 'RESERVA_PAULISTANO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <MapPin className="h-4 w-4 text-primary" />
                      Condomínio
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Já abre com bloco e apartamento no foco da operação.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPadraoNovoPedidoEntrega('RETIRADA')
                      setIsDirty(true)
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoEntrega === 'RETIRADA' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Store className="h-4 w-4 text-primary" />
                      Retirada
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Ideal quando o fechamento costuma ser no balcao.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPadraoNovoPedidoEntrega('ENCOMENDA')
                      setIsDirty(true)
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoEntrega === 'ENCOMENDA' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <PackageCheck className="h-4 w-4 text-primary" />
                      Encomenda
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Ja deixa o fluxo pronto para data e hora agendadas.</p>
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Pagamento inicial</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoPagamento('DINHEIRO')
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoPagamento === 'DINHEIRO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <Wallet className="h-4 w-4 text-primary" />
                    Dinheiro
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Não exige confirmação extra.</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoPagamento('PIX')
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoPagamento === 'PIX' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <QrCode className="h-4 w-4 text-primary" />
                    PIX
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Ja abre com pagamento pendente.</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoPagamento('CARTAO')
                    setPadraoNovoPedidoTipoCartao('CREDITO')
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoPagamento === 'CARTAO' && padraoNovoPedidoTipoCartao === 'CREDITO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Cartão crédito
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Taxa prevista de 3,09%.</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoPagamento('CARTAO')
                    setPadraoNovoPedidoTipoCartao('DEBITO')
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoPagamento === 'CARTAO' && padraoNovoPedidoTipoCartao === 'DEBITO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Cartão débito
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Taxa prevista de 0,89%.</p>
                </button>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoDescontosExpandidos((current) => !current)
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoDescontosExpandidos ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <p className="font-semibold">Descontos</p>
                  <p className="mt-2 text-xs text-muted-foreground">Padrão: {padraoNovoPedidoDescontosExpandidos ? 'expandido' : 'recolhido'}.</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoObservacoesExpandidas((current) => !current)
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoObservacoesExpandidas ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <p className="font-semibold">Observações</p>
                  <p className="mt-2 text-xs text-muted-foreground">Padrão: {padraoNovoPedidoObservacoesExpandidas ? 'expandido' : 'recolhido'}.</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPadraoNovoPedidoResponsavelExpandido((current) => !current)
                    setIsDirty(true)
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${padraoNovoPedidoResponsavelExpandido ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                >
                  <p className="font-semibold">Responsavel e etiquetas</p>
                  <p className="mt-2 text-xs text-muted-foreground">Padrão: {padraoNovoPedidoResponsavelExpandido ? 'expandido' : 'recolhido'}.</p>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/65 p-4">
              <div className="mb-4">
                <Label className="text-base">Checkout público</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Defina quais entregas e pagamentos ficam visíveis para o cliente no pedido via link público.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background p-4">
                  <div className="mb-4">
                    <p className="text-sm font-medium">Tipos de entrega disponíveis</p>
                    <p className="mt-1 text-xs text-muted-foreground">O cliente vê apenas as opções habilitadas aqui.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">Reserva Paulistano</p>
                        <p className="text-xs text-muted-foreground">Entrega no condomínio.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoEntregaReservaPaulistano}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoEntregaReservaPaulistano(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">Retirada</p>
                        <p className="text-xs text-muted-foreground">Usa o endereço configurado da loja.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoEntregaRetirada}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoEntregaRetirada(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">Encomenda</p>
                        <p className="text-xs text-muted-foreground">Agendamento especial de produção.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoEntregaEncomenda}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoEntregaEncomenda(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>
                  </div>

                  {checkoutPublicoEntregaEncomenda ? (
                    <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <CalendarClock className="h-4 w-4 text-primary" />
                        Regra da encomenda
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCheckoutPublicoEncomendaModo('CLIENTE_DEFINE')
                            setIsDirty(true)
                          }}
                          className={`rounded-2xl border p-4 text-left transition ${checkoutPublicoEncomendaModo === 'CLIENTE_DEFINE' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                        >
                          <p className="font-semibold">Cliente define</p>
                          <p className="mt-2 text-xs text-muted-foreground">O checkout mostra data e hora para o cliente escolher.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCheckoutPublicoEncomendaModo('FIXO')
                            setIsDirty(true)
                          }}
                          className={`rounded-2xl border p-4 text-left transition ${checkoutPublicoEncomendaModo === 'FIXO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'}`}
                        >
                          <p className="font-semibold">Data fixa do admin</p>
                          <p className="mt-2 text-xs text-muted-foreground">Todos os pedidos de encomenda usam a data definida aqui.</p>
                        </button>
                      </div>

                      {checkoutPublicoEncomendaModo === 'FIXO' ? (
                        <div className="mt-4 space-y-2">
                          <Label htmlFor="checkout-encomenda-fixa">Data fixa</Label>
                          <Input
                            id="checkout-encomenda-fixa"
                            type="date"
                            value={checkoutPublicoEncomendaDataFixa}
                            onChange={(event) => {
                              setCheckoutPublicoEncomendaDataFixa(event.target.value)
                              setIsDirty(true)
                            }}
                            className="h-11 rounded-2xl"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border/70 bg-background p-4">
                  <div className="mb-4">
                    <p className="text-sm font-medium">Pagamentos disponíveis</p>
                    <p className="mt-1 text-xs text-muted-foreground">O cliente escolhe apenas os métodos liberados para controle operacional.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">PIX</p>
                        <p className="text-xs text-muted-foreground">Referencia para atendimento.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoPagamentoPix}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoPagamentoPix(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">Dinheiro</p>
                        <p className="text-xs text-muted-foreground">Pagamento combinado na entrega ou retirada.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoPagamentoDinheiro}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoPagamentoDinheiro(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="font-medium">Cartao</p>
                        <p className="text-xs text-muted-foreground">Mostra credito e debito como no pedido manual.</p>
                      </div>
                      <Switch
                        checked={checkoutPublicoPagamentoCartao}
                        onCheckedChange={(value) => {
                          setCheckoutPublicoPagamentoCartao(value)
                          setIsDirty(true)
                        }}
                      />
                    </div>
                  </div>

                  {checkoutPublicoPagamentoCartao ? (
                    <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
                      <p className="text-sm font-medium">Opções dentro de cartão</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background p-3">
                          <div>
                            <p className="font-medium">Crédito</p>
                            <p className="text-xs text-muted-foreground">Aparece como escolha para o cliente.</p>
                          </div>
                          <Switch
                            checked={checkoutPublicoPagamentoCartaoCredito}
                            onCheckedChange={(value) => {
                              setCheckoutPublicoPagamentoCartaoCredito(value)
                              setIsDirty(true)
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background p-3">
                          <div>
                            <p className="font-medium">Débito</p>
                            <p className="text-xs text-muted-foreground">Aparece como escolha para o cliente.</p>
                          </div>
                          <Switch
                            checked={checkoutPublicoPagamentoCartaoDebito}
                            onCheckedChange={(value) => {
                              setCheckoutPublicoPagamentoCartaoDebito(value)
                              setIsDirty(true)
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Mensagens padrão do WhatsApp
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Edite os textos enviados ao avancar o status do pedido. As variaveis abaixo sao substituidas automaticamente.
                  </p>
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-background/75 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="envio-automatico-whatsapp">Envio automático de mensagens</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando desligado, o status do pedido continua mudando normalmente, mas o WhatsApp não abre sozinho.
                  </p>
                </div>
                <Switch
                  id="envio-automatico-whatsapp"
                  checked={envioAutomaticoWhatsappStatus}
                  onCheckedChange={(value) => {
                    setEnvioAutomaticoWhatsappStatus(value)
                    setIsDirty(true)
                  }}
                />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {supportedStatusTemplateVariables.map(variable => (
                  <span key={variable} className="max-w-full break-all rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                    {variable}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {statusMessageTemplateFields.map(field => {
                  const valueByField = {
                    mensagemStatusAceito,
                    mensagemStatusPreparacao,
                    mensagemStatusEntregue,
                  }
                  const setterByField = {
                    mensagemStatusAceito: setMensagemStatusAceito,
                    mensagemStatusPreparacao: setMensagemStatusPreparacao,
                    mensagemStatusEntregue: setMensagemStatusEntregue,
                  }
                  const value = valueByField[field.key] ?? ''
                  const setValue = setterByField[field.key]

                  return (
                    <div key={field.key} className="min-w-0 space-y-3 rounded-xl border border-border bg-background/80 p-4 shadow-sm">
                      <div>
                        <Label htmlFor={field.key}>{field.title}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                      </div>
                      <Textarea
                        id={field.key}
                        value={value}
                        onChange={event => {
                          setValue(event.target.value)
                          setIsDirty(true)
                        }}
                        rows={10}
                        className="min-h-[220px] resize-y md:min-h-[250px]"
                      />
                      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>{value.trim().length} caracteres</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setValue(getDefaultStatusTemplate(field.key))
                            setIsDirty(true)
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Restaurar padrão
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-0 md:mr-2 animate-spin" />
                    <span className="hidden md:inline">Salvando...</span>
                  </>
                ) : saved ? (
                  <span className="hidden md:inline">Salvo!</span>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-0 md:mr-2" />
                    Salvar configurações
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {isDirty ? 'Existem alterações pendentes nesta tela.' : 'Nenhuma alteração pendente no momento.'}
              </span>
            </div>

            {submitError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="grid max-w-6xl gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Links de Acesso
          </CardTitle>
          <CardDescription>
            Use o link do catálogo para clientes. O acesso admin fica separado e interno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4 text-primary" />
              Link público do catálogo
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={publicCatalogUrl} readOnly />
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => copyToClipboard(publicCatalogUrl, 'Link do catálogo copiado.')}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Esse é o link que você envia para clientes. Ele abre direto o catálogo e não expõe a entrada do painel.
            </p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-primary" />
              Link interno do admin
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={adminLoginUrl} readOnly />
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => copyToClipboard(adminLoginUrl, 'Link do admin copiado.')}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Mantenha esse link apenas para uso interno. O painel continua protegido por login e não aparece mais na entrada pública.
            </p>
          </div>

          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">
            Para reforcar o acesso do painel, configure a variavel <code>ADMIN_ACCESS_KEY</code> no ambiente. Com ela ativa, o sistema exige uma chave privada antes mesmo da tela de login abrir.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas e permissões
          </CardTitle>
          <CardDescription>
            Configure os avisos de novos pedidos neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={alertMessage ? `rounded-xl border p-3 ${permissionTone}` : `rounded-xl border p-3 ${permissionTone}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="alertas">Notificações de novos pedidos</Label>
              <p className="text-xs text-muted-foreground">
                Permissao atual: {permissionLabel}.
              </p>
            </div>
            <Switch
              id="alertas"
              checked={alertsEnabled}
              onCheckedChange={handleToggleAlerts}
              disabled={notificationPermission === 'unsupported'}
            />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/75 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="som-alerta">Som de alerta</Label>
              <p className="text-xs text-muted-foreground">
                O som precisa ser reativado por clique quando o navegador recarrega a página.
              </p>
            </div>
            <Switch
              id="som-alerta"
              checked={soundEnabled}
              onCheckedChange={handleToggleSound}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => handleToggleAlerts(true)}>
              <Bell className="h-4 w-4 mr-2" />
              Solicitar permissão
            </Button>
            <Button type="button" variant="outline" onClick={playTestSound}>
              <Volume2 className="h-4 w-4 mr-2" />
              Testar som
            </Button>
          </div>

          {alertMessage && (
            <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              {alertMessage}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Observação: som customizado com aba minimizada depende das regras do navegador e do sistema operacional.
            As notificações do sistema são o comportamento mais confiável em segundo plano.
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
