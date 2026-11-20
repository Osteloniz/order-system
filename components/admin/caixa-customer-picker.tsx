'use client'

import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CaixaRequestError, requestCaixa, type ClienteCaixa } from '@/components/admin/caixa-client'

type BuscaClientes = { clientes: ClienteCaixa[]; cadastroRapidoTelefone: string | null }

export function CaixaCustomerPicker({ onSelect, onExpire, allowCreate = false, requirePhone = false, disabled = false }: {
  onSelect: (cliente: ClienteCaixa) => void
  onExpire: () => void
  allowCreate?: boolean
  requirePhone?: boolean
  disabled?: boolean
}) {
  const searchId = useId()
  const nameId = useId()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<BuscaClientes>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>, create = false) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (create) {
        const nome = new FormData(event.currentTarget).get('nome')
        const { cliente } = await requestCaixa<{ cliente: Omit<ClienteCaixa, 'telefoneFinal'> & { telefone: string | null } }>(
          'clientes', 'POST', { nome, telefone: result?.cadastroRapidoTelefone },
        )
        setResult({ clientes: [{ id: cliente.id, nome: cliente.nome, telefoneFinal: cliente.telefone?.slice(-4) ?? null }], cadastroRapidoTelefone: null })
      } else {
        setResult(undefined)
        setResult(await requestCaixa<BuscaClientes>('clientes?q=' + encodeURIComponent(query.trim())))
      }
    } catch (error) {
      if (error instanceof CaixaRequestError && error.status === 401) onExpire()
      setError(error instanceof Error ? error.message : 'Não foi possível consultar os cadastros.')
    } finally {
      setBusy(false)
    }
  }

  const blocked = disabled || busy
  const cadastroRapido = allowCreate && result?.cadastroRapidoTelefone

  return (
    <div className="grid gap-2">
      <form onSubmit={submit} className="grid gap-2">
        <Label htmlFor={searchId}>Buscar cliente por nome ou telefone</Label>
        <div className="flex gap-2">
          <Input id={searchId} className="h-11" maxLength={80} minLength={2} value={query} disabled={blocked}
            onChange={(event) => { setQuery(event.target.value); setResult(undefined); setError('') }} required />
          <Button type="submit" variant="outline" className="h-11" disabled={blocked || query.trim().length < 2}>
            {busy ? 'Aguarde…' : 'Buscar'}
          </Button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result?.clientes.length === 0 && <p role="status" className="text-sm text-muted-foreground">
        {allowCreate && !cadastroRapido ? 'Nenhum cliente encontrado. Busque pelo telefone completo para cadastrar.' : 'Nenhum cliente encontrado.'}
      </p>}
      {cadastroRapido && <form onSubmit={(event) => submit(event, true)} className="grid gap-2">
        <Label htmlFor={nameId}>Nome para novo cadastro</Label>
        <Input id={nameId} name="nome" className="h-11" minLength={2} maxLength={80} required disabled={blocked} />
        <Button type="submit" variant="outline" className="justify-self-start" disabled={blocked}>Cadastrar</Button>
      </form>}
      {!!result?.clientes.length && (
        <ul className="divide-y rounded-lg border px-2" aria-label="Resultados da busca">
          {result.clientes.map((cliente) => <li key={cliente.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 break-words">{cliente.nome}{cliente.telefoneFinal
              ? <small className="block text-muted-foreground">Telefone final {cliente.telefoneFinal}</small>
              : requirePhone && <small className="block text-muted-foreground">Sem telefone válido para venda pendente</small>}</span>
            <Button type="button" variant="outline" className="min-h-11" disabled={blocked || (requirePhone && !cliente.telefoneFinal)} onClick={() => onSelect(cliente)}>Selecionar</Button>
          </li>)}
        </ul>
      )}
    </div>
  )
}
