'use client'

import React from "react"

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { Save, Loader2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Configuracao } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function ConfigPage() {
  const { data: config, isLoading } = useSWR<Configuracao>('/api/admin/config', fetcher)
  
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState('')
  const [enderecoRetirada, setEnderecoRetirada] = useState('')
  const [freteBase, setFreteBase] = useState('')
  const [freteRaioKm, setFreteRaioKm] = useState('')
  const [freteKmExcedente, setFreteKmExcedente] = useState('')
  const [estabelecimentoLat, setEstabelecimentoLat] = useState('')
  const [estabelecimentoLng, setEstabelecimentoLng] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

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
      mutate('/api/admin/config')
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
              <Label htmlFor="freteBase">Frete base atÃ© o raio (R$)</Label>
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
                NecessÃ¡rio para calcular frete por geolocalizaÃ§Ã£o
              </p>
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
    </div>
  )
}
