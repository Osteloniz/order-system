'use client'

import React from "react"

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, MessageCircle, RotateCcw, Save, Loader2, Settings, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getAdminAlertSoundEnabled, getAdminAlertsEnabled, getNotificationPermission, setAdminAlertSoundEnabled, setAdminAlertsEnabled } from '@/lib/admin-alert-settings'
import type { Configuracao } from '@/lib/types'
import { getDefaultStatusTemplate, statusMessageTemplateFields, supportedStatusTemplateVariables } from '@/lib/message-templates'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function ConfigPage() {
  const { data: config, isLoading } = useSWR<Configuracao>('/api/admin/config', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: tenantData } = useSWR('/api/admin/tenant', fetcher, {
    revalidateOnFocus: false,
  })

  const [nomeEstabelecimento, setNomeEstabelecimento] = useState('')
  const [enderecoRetirada, setEnderecoRetirada] = useState('')
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
  const configHydratedRef = useRef(false)
  const tenantHydratedRef = useRef(false)

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

    const payload: Record<string, number | string> = {
      nomeEstabelecimento,
      enderecoRetirada,
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
      const tenantResponse = await fetch('/api/admin/tenant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen })
      })
      const updatedConfig = await configResponse.json()
      const updatedTenant = await tenantResponse.json()
      mutate('/api/admin/config', updatedConfig, false)
      mutate('/api/admin/tenant', updatedTenant, false)
      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Dados do Estabelecimento
          </CardTitle>
          <CardDescription>
            Configure as informações básicas do seu negócio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
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

              <div className="space-y-2 md:col-span-2">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
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
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Mensagens padrao do WhatsApp
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Edite os textos enviados ao avancar o status do pedido. As variaveis abaixo sao substituidas automaticamente.
                  </p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {supportedStatusTemplateVariables.map(variable => (
                  <span key={variable} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
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
                  const value = valueByField[field.key]
                  const setValue = setterByField[field.key]

                  return (
                    <div key={field.key} className="space-y-3 rounded-xl border border-border bg-background/80 p-4 shadow-sm">
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
                        rows={12}
                        className="min-h-[250px] resize-y"
                      />
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
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
                          Restaurar padrao
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

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
                  Salvar Configurações
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
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
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="alertas">Notificações de novos pedidos</Label>
              <p className="text-xs text-muted-foreground">
                Permissão atual: {notificationPermission === 'granted' ? 'permitida' : notificationPermission === 'denied' ? 'bloqueada' : notificationPermission === 'default' ? 'pendente' : 'não suportada'}.
              </p>
            </div>
            <Switch
              id="alertas"
              checked={alertsEnabled}
              onCheckedChange={handleToggleAlerts}
              disabled={notificationPermission === 'unsupported'}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
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
  )
}
