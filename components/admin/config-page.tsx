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
  const [freteFixo, setFreteFixo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setNomeEstabelecimento(config.nomeEstabelecimento)
      setEnderecoRetirada(config.enderecoRetirada)
      setFreteFixo((config.freteFixo / 100).toFixed(2).replace('.', ','))
    }
  }, [config])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSaved(false)

    const freteNumero = Number.parseFloat(freteFixo.replace(',', '.')) * 100

    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeEstabelecimento,
          enderecoRetirada,
          freteFixo: freteNumero
        })
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
              <Label htmlFor="frete">Taxa de Entrega (R$)</Label>
              <Input
                id="frete"
                value={freteFixo}
                onChange={e => setFreteFixo(e.target.value)}
                placeholder="0,00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Valor fixo cobrado para entregas
              </p>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : saved ? (
                'Salvo!'
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
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
