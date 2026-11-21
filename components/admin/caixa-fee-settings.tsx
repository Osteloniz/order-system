'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CaixaFeeRates } from '@/lib/caixa-fees'

const endpoint = '/api/admin/caixa-taxas'

async function requestRates(rates?: CaixaFeeRates): Promise<CaixaFeeRates> {
  const response = await fetch(endpoint, rates ? {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rates),
  } : undefined)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível consultar as taxas.')
  return data
}

function toBasisPoints(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return NaN
  return Math.round(Number(text.replace(',', '.')) * 100)
}

export function CaixaFeeSettings() {
  const { data, error, mutate } = useSWR(endpoint, () => requestRates(), { revalidateOnFocus: false })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const rates = {
      caixaTaxaCreditoBp: toBasisPoints(fields.get('credito')),
      caixaTaxaDebitoBp: toBasisPoints(fields.get('debito')),
    }
    setSaved(false)
    if (!Object.values(rates).every((rate) => Number.isInteger(rate) && rate >= 0 && rate <= 10_000)) {
      setSaveError('Informe percentuais entre 0 e 100, com até duas casas decimais.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const updated = await requestRates(rates)
      await mutate(updated, { revalidate: false })
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar as taxas.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card id="config-caixa-taxas" className="max-w-6xl scroll-mt-3 gap-3">
      <CardHeader>
        <CardTitle>Taxas do Caixa Express</CardTitle>
        <CardDescription>Informe o percentual cobrado por crédito e débito no balcão.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        {!data && !error && <p role="status" className="text-sm text-muted-foreground">Carregando taxas…</p>}
        {data && <form key={`${data.caixaTaxaCreditoBp}:${data.caixaTaxaDebitoBp}`} onSubmit={save} onChange={() => setSaved(false)}>
          <fieldset disabled={saving} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="caixa-taxa-credito">Crédito (%)</Label>
              <Input id="caixa-taxa-credito" name="credito" inputMode="decimal" defaultValue={(data.caixaTaxaCreditoBp / 100).toFixed(2).replace('.', ',')} required className="w-32" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caixa-taxa-debito">Débito (%)</Label>
              <Input id="caixa-taxa-debito" name="debito" inputMode="decimal" defaultValue={(data.caixaTaxaDebitoBp / 100).toFixed(2).replace('.', ',')} required className="w-32" />
            </div>
            <Button type="submit" className="min-h-11">{saving ? 'Salvando…' : 'Salvar taxas'}</Button>
          </fieldset>
        </form>}
        {saveError && <p role="alert" className="mt-2 text-sm text-destructive">{saveError}</p>}
        <p role="status" className="mt-2 text-sm text-success">{saved ? 'Taxas do Caixa salvas.' : ''}</p>
      </CardContent>
    </Card>
  )
}
