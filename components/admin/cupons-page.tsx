'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { BadgePercent, Save, Trash2, Pencil, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatarMoeda } from '@/lib/calc'
import type { Cupom, TipoCupom } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function CuponsPage() {
  const { data: cupons, isLoading } = useSWR<Cupom[]>('/api/admin/cupons', fetcher)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<TipoCupom>('FIXO')
  const [valor, setValor] = useState('')
  const [maxUsos, setMaxUsos] = useState('1')
  const [expiraEm, setExpiraEm] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (editingId && cupons) {
      const cupom = cupons.find(c => c.id === editingId)
      if (cupom) {
        setCodigo(cupom.codigo)
        setTipo(cupom.tipo)
        if (cupom.tipo === 'FIXO') {
          setValor((cupom.valor / 100).toFixed(2).replace('.', ','))
        } else {
          setValor(String(cupom.valor))
        }
        setMaxUsos(String(cupom.maxUsos))
        setExpiraEm(cupom.expiraEm.slice(0, 16))
      }
    }
  }, [editingId, cupons])

  const resetForm = () => {
    setEditingId(null)
    setCodigo('')
    setTipo('FIXO')
    setValor('')
    setMaxUsos('1')
    setExpiraEm('')
    setError('')
  }

  const parseValor = () => {
    if (tipo === 'FIXO') {
      return Math.round(Number.parseFloat(valor.replace(',', '.')) * 100)
    }
    return Math.round(Number.parseFloat(valor.replace(',', '.')))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSaving(true)

    const valorNumero = parseValor()
    const maxUsosNumero = Number.parseInt(maxUsos, 10)

    if (!codigo.trim()) {
      setError('Informe o codigo')
      setIsSaving(false)
      return
    }
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setError('Valor invalido')
      setIsSaving(false)
      return
    }
    if (!Number.isFinite(maxUsosNumero) || maxUsosNumero <= 0) {
      setError('Limite de usos invalido')
      setIsSaving(false)
      return
    }
    if (!expiraEm) {
      setError('Informe a data de expiracao')
      setIsSaving(false)
      return
    }

    try {
      const payload = {
        codigo: codigo.trim().toUpperCase(),
        tipo,
        valor: valorNumero,
        maxUsos: maxUsosNumero,
        expiraEm: new Date(expiraEm).toISOString()
      }

      const url = editingId ? `/api/admin/cupons/${editingId}` : '/api/admin/cupons'
      const method = editingId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao salvar cupom')
      }

      mutate('/api/admin/cupons')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cupom')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleAtivo = async (cupom: Cupom) => {
    await fetch(`/api/admin/cupons/${cupom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !cupom.ativo })
    })
    mutate('/api/admin/cupons')
  }

  const handleDelete = async (cupom: Cupom) => {
    if (!confirm('Excluir cupom?')) return
    await fetch(`/api/admin/cupons/${cupom.id}`, { method: 'DELETE' })
    mutate('/api/admin/cupons')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Cupons</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{editingId ? 'Editar cupom' : 'Novo cupom'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codigo">Codigo</Label>
                <Input
                  id="codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="PROMO10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(value) => setTipo(value as TipoCupom)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXO">Valor fixo (R$)</SelectItem>
                    <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">{tipo === 'FIXO' ? 'Valor (R$)' : 'Percentual (%)'}</Label>
                <Input
                  id="valor"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={tipo === 'FIXO' ? '10,00' : '10'}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxUsos">Limite de usos</Label>
                <Input
                  id="maxUsos"
                  value={maxUsos}
                  onChange={(e) => setMaxUsos(e.target.value)}
                  placeholder="100"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="expiraEm">Expira em</Label>
                <Input
                  id="expiraEm"
                  type="datetime-local"
                  value={expiraEm}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={isSaving}>
                <Save className="h-4 w-4 mr-0 md:mr-2" />
                <span className="hidden md:inline">
                  {editingId ? 'Salvar alterações' : 'Criar cupom'}
                </span>
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cupons cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p>Carregando...</p>}
          {!isLoading && (!cupons || cupons.length === 0) && (
            <p className="text-muted-foreground">Nenhum cupom cadastrado</p>
          )}
          {cupons?.map(cupom => (
            <div key={cupom.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="font-medium">{cupom.codigo}</div>
                <div className="text-sm text-muted-foreground">
                  {cupom.tipo === 'FIXO'
                    ? `${formatarMoeda(cupom.valor)}`
                    : `${cupom.valor}%`}
                  {' '}| Usos: {cupom.usos}/{cupom.maxUsos}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expira em: {new Date(cupom.expiraEm).toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => handleToggleAtivo(cupom)}>
                  <Power className="h-4 w-4 mr-2" />
                  {cupom.ativo ? 'Desativar' : 'Ativar'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingId(cupom.id)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button type="button" variant="destructive" onClick={() => handleDelete(cupom)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}


