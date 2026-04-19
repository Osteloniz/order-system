'use client'

import React from "react"

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, Save, Loader2, Settings, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getAdminAlertSoundEnabled, getAdminAlertsEnabled, getNotificationPermission, setAdminAlertSoundEnabled, setAdminAlertsEnabled } from '@/lib/admin-alert-settings'
import type { Configuracao } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function ConfigPage() {
  const { data: config, isLoading } = useSWR<Configuracao>('/api/admin/config', fetcher)
  const { data: tenantData } = useSWR('/api/admin/tenant', fetcher)

  const [nomeEstabelecimento, setNomeEstabelecimento] = useState('')
  const [enderecoRetirada, setEnderecoRetirada] = useState('')
  const [freteBase, setFreteBase] = useState('')
  const [freteRaioKm, setFreteRaioKm] = useState('')
  const [freteKmExcedente, setFreteKmExcedente] = useState('')
  const [estabelecimentoLat, setEstabelecimentoLat] = useState('')
  const [estabelecimentoLng, setEstabelecimentoLng] = useState('')
  const [isOpen, setIsOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [alertsEnabled, setAlertsEnabledState] = useState(false)
  const [soundEnabled, setSoundEnabledState] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState('unsupported')
  const [alertMessage, setAlertMessage] = useState('')

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
    if (config) {
      setNomeEstabelecimento(config.nomeEstabelecimento)
      setEnderecoRetirada(config.enderecoRetirada)
      setFreteBase((config.freteBase / 100).toFixed(2).replace('.', ','))
      setFreteRaioKm(String(config.freteRaioKm))
      setFreteKmExcedente((config.freteKmExcedente / 100).toFixed(2).replace('.', ','))
      setEstabelecimentoLat(String(config.estabelecimentoLat))
      setEstabelecimentoLng(String(config.estabelecimentoLng))
    }
  }, [config])

  useEffect(() => {
    if (tenantData && typeof tenantData.isOpen === 'boolean') {
      setIsOpen(tenantData.isOpen)
    }
  }, [tenantData])

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

    const freteBaseNumero = Number.parseFloat(freteBase.replace(',', '.')) * 100
    const freteRaioNumero = Number.parseFloat(freteRaioKm.replace(',', '.'))
    const freteKmExcedenteNumero = Number.parseFloat(freteKmExcedente.replace(',', '.')) * 100
    const latNumero = Number.parseFloat(estabelecimentoLat.replace(',', '.'))
    const lngNumero = Number.parseFloat(estabelecimentoLng.replace(',', '.'))

    const payload: Record<string, number | string> = {
      nomeEstabelecimento,
      enderecoRetirada,
      freteBase: freteBaseNumero,
      freteRaioKm: freteRaioNumero,
      freteKmExcedente: freteKmExcedenteNumero
    }

    if (Number.isFinite(latNumero)) {
      payload.estabelecimentoLat = latNumero
    }
    if (Number.isFinite(lngNumero)) {
      payload.estabelecimentoLng = lngNumero
    }

    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      await fetch('/api/admin/tenant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen })
      })
      mutate('/api/admin/config')
      mutate('/api/admin/tenant')
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

      <Card className="max-w-xl">
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
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Estabelecimento</Label>
              <Input
                id="nome"
                value={nomeEstabelecimento}
                onChange={e => setNomeEstabelecimento(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço para Retirada</Label>
              <Input
                id="endereco"
                value={enderecoRetirada}
                onChange={e => setEnderecoRetirada(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freteBase">Frete base até o raio (R$)</Label>
              <Input
                id="freteBase"
                value={freteBase}
                onChange={e => setFreteBase(e.target.value)}
                placeholder="5,00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Valor cobrado para entregas dentro do raio base
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="freteRaioKm">Raio base (km)</Label>
              <Input
                id="freteRaioKm"
                value={freteRaioKm}
                onChange={e => setFreteRaioKm(e.target.value)}
                placeholder="3"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freteKmExcedente">Valor por km excedente (R$)</Label>
              <Input
                id="freteKmExcedente"
                value={freteKmExcedente}
                onChange={e => setFreteKmExcedente(e.target.value)}
                placeholder="1,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lat">Latitude do estabelecimento</Label>
              <Input
                id="lat"
                value={estabelecimentoLat}
                onChange={e => setEstabelecimentoLat(e.target.value)}
                placeholder="-23.55052"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lng">Longitude do estabelecimento</Label>
              <Input
                id="lng"
                value={estabelecimentoLng}
                onChange={e => setEstabelecimentoLng(e.target.value)}
                placeholder="-46.633308"
              />
              <p className="text-xs text-muted-foreground">
                Necessário para calcular frete por geolocalização
              </p>
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
                  onCheckedChange={setIsOpen}
                />
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
