'use client'

import Image from 'next/image'
import { useEffect, useState, type FormEvent } from 'react'
import type { TemaVisual } from '@prisma/client'
import useSWR from 'swr'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const assetPaths = { NATAL: 'natal', ANO_NOVO: 'ano-novo' } as const

const labels: Record<TemaVisual, string> = { PADRAO: 'Padrão', NATAL: 'Natal', ANO_NOVO: 'Ano Novo' }

function useInternalTheme() {
  const { tenantId } = useAdminAuth()
  return useSWR<{ temaVisual: TemaVisual }>(tenantId ? [tenantId, '/api/admin/tema'] as const : null, async () => {
    const response = await fetch('/api/admin/tema')
    if (!response.ok) throw new Error('Não foi possível consultar o tema.')
    return response.json()
  })
}

export function AdminInternalTheme() {
  const { data } = useInternalTheme()
  return <InternalTheme current={data?.temaVisual ?? 'PADRAO'} />
}

export function InternalTheme({ current }: { current: TemaVisual }) {
  useEffect(() => {
    document.documentElement.dataset.brookieInternal = current
    return () => { delete document.documentElement.dataset.brookieInternal }
  }, [current])
  return null
}

export function InternalThemeArtwork() {
  const { data } = useInternalTheme()
  const theme = data?.temaVisual
  if (!theme || theme === 'PADRAO') {
    return <>
      <Image src="/brand/brookie-logo-light.jpg" alt="Brookie Pregiato" fill sizes="(max-width: 640px) 112px, 180px" className="rounded-full object-cover dark:hidden" />
      <Image src="/brand/brookie-logo-dark.jpg" alt="Brookie Pregiato" fill sizes="(max-width: 640px) 112px, 180px" className="hidden rounded-full object-cover dark:block" />
    </>
  }
  return (
    <div className="absolute inset-0 rounded-[28%] bg-[#fbf0d9]">
      <Image src={`/brand/themes/${assetPaths[theme]}/transparente.webp`} alt={`Brookie Pregiato · ${labels[theme]}`}
        fill sizes="(max-width: 640px) 112px, 180px" className="object-contain p-2" />
    </div>
  )
}

export function InternalThemeSettings() {
  const { data, error, mutate } = useInternalTheme()
  const [draft, setDraft] = useState<TemaVisual>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const theme = draft ?? data?.temaVisual ?? 'PADRAO'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/tema', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temaVisual: theme }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      await mutate(result, false)
      setDraft(undefined)
      setMessage('Tema atualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o tema.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="tema-interno">Tema visual do ambiente interno</Label>
        <select id="tema-interno" className="h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          value={theme} onChange={(event) => setDraft(event.target.value as TemaVisual)} disabled={!data || busy}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {theme !== 'PADRAO' && <Image src={`/brand/themes/${assetPaths[theme]}/unitaria.webp`} alt={`Prévia do tema ${labels[theme]}`}
        width={56} height={56} className="rounded-lg border" />}
      <Button type="submit" variant="outline" disabled={!data || busy || theme === data.temaVisual}>Salvar tema</Button>
      {(message || error) && <p role="status" className="basis-full text-sm text-muted-foreground">{message || error.message}</p>}
    </form>
  )
}
