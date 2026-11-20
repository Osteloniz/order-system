'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarMoeda } from '@/lib/calc'
import { meiosCaixa, meioCaixaLabel, operacaoCaixa, type MeioCaixa, type OperacaoCaixa } from '@/lib/caixa-contract'
import { CaixaRequestError, requestCaixa, type ClienteCaixa } from '@/components/admin/caixa-client'
import { CaixaCustomerPicker } from '@/components/admin/caixa-customer-picker'
import { useCaixaMovement } from '@/components/admin/use-caixa-movement'

type VendaDetalhe = {
  id: string; numero: string; clienteId: string | null; clienteNome: string; total: number; status: string; statusPagamento: string
  meio: MeioCaixa; caixaRecebimentoAtualId: string | null
  itens: { produtoId: string; nomeProdutoSnapshot: string; quantidade: number }[]
  caixaEventos: {
    operacao: OperacaoCaixa['operacao'] | 'VENDA'; criadoEm: string; efetivoEm: string | null
    bruto: number | null; taxa: number | null; meio: string | null; tipoCartao: string | null; motivo: string | null
  }[]
}

const actions = {
  BAIXA: 'Confirmar recebimento',
  CORRECAO: 'Corrigir lançamento',
  ESTORNO: 'Registrar estorno',
  CANCELAMENTO: 'Cancelar pendência',
  DEVOLUCAO: 'Repor itens devolvidos',
  VENDA: 'Venda criada',
} satisfies Record<OperacaoCaixa['operacao'] | 'VENDA', string>

export function CaixaGestao({ storageKey, expire, initialNumber }: {
  storageKey: string; expire: () => void; initialNumber?: string
}) {
  const [numero, setNumero] = useState(initialNumber ?? '')
  const [vendas, setVendas] = useState<VendaDetalhe[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [searching, setSearching] = useState(false)
  const [alert, setAlert] = useState('')
  const movement = useCaixaMovement(storageKey, expire, () => { void buscar(numero) })
  const venda = vendas.find((current) => current.id === selectedId) ?? vendas[0]

  async function buscar(value: string) {
    if (!/^[a-f0-9]{8}$/i.test(value.trim())) return
    setSearching(true)
    setAlert('')
    try {
      const result = await requestCaixa<{ vendas: VendaDetalhe[] }>('gestao?numero=' + encodeURIComponent(value.trim()))
      setVendas(result.vendas)
      if (!result.vendas.length) setAlert('Venda do Caixa não encontrada.')
    } catch (error) {
      if (error instanceof CaixaRequestError && error.status === 401) expire()
      setAlert(error instanceof Error ? error.message : 'Consulta indisponível.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="max-w-3xl rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="caixa-gerenciar">
      <h2 id="caixa-gerenciar" className="mb-3 text-lg font-semibold">Gerenciar venda do Caixa</h2>
      <form onSubmit={(event) => { event.preventDefault(); void buscar(numero) }} className="grid max-w-xs gap-2">
        <Label htmlFor="gestao-numero">Número da venda</Label>
        <div className="flex gap-2">
          <Input id="gestao-numero" value={numero} onChange={(event) => setNumero(event.target.value)} maxLength={8} minLength={8} pattern="[A-Fa-f0-9]{8}" required />
          <Button type="submit" variant="outline" disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</Button>
        </div>
      </form>
      {(alert || movement.message) && <p role="status" className="mt-3 text-sm">{alert || movement.message}</p>}
      {movement.pending && <Button className="mt-3" disabled={movement.busy} onClick={() => movement.pending && movement.run(movement.pending)}>Consultar tentativa</Button>}
      {vendas.length > 1 && <div className="mt-3 grid gap-2">
        <Label htmlFor="venda-coincidente">Selecione a venda</Label>
        <select id="venda-coincidente" value={venda.id} onChange={(event) => setSelectedId(event.target.value)} className="h-10 rounded-md border bg-background px-2">
          {vendas.map((current) => <option key={current.id} value={current.id}>{current.clienteNome} · {formatarMoeda(current.total)} · {current.id.slice(0, 8)}</option>)}
        </select>
      </div>}
      {venda && <div className="mt-4 border-t pt-3">
        <p className="font-semibold">#{venda.numero} · {venda.clienteNome} · {formatarMoeda(venda.total)}</p>
        <ul className="my-2 space-y-1 text-sm text-muted-foreground">
          {venda.caixaEventos.map((evento, index) => <li key={index}>
            {actions[evento.operacao]} · {new Date(evento.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            {evento.meio && ' · ' + meioCaixaLabel[(evento.tipoCartao ?? evento.meio) as MeioCaixa]}
            {evento.taxa !== null && ' · taxa ' + formatarMoeda(evento.taxa)}{evento.motivo && ' · ' + evento.motivo}
          </li>)}
        </ul>
        {!venda.clienteId && venda.status === 'ENTREGUE' && venda.statusPagamento === 'APROVADO' &&
          <VinculoCliente key={venda.id} pedidoId={venda.id} expire={expire} disabled={movement.busy || Boolean(movement.pending)}
            onSaved={async () => { await buscar(venda.numero); setAlert('Cliente vinculado à venda.') }} />}
        <MovementForm key={JSON.stringify([venda.id, venda.statusPagamento, venda.caixaRecebimentoAtualId, venda.caixaEventos.length])}
          venda={venda} disabled={movement.busy || Boolean(movement.pending)} run={movement.run} />
      </div>}
    </section>
  )
}

function VinculoCliente({ pedidoId, expire, onSaved, disabled }: {
  pedidoId: string; expire: () => void; onSaved: () => Promise<void>; disabled: boolean
}) {
  const [selecionado, setSelecionado] = useState<ClienteCaixa>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function vincular() {
    if (!selecionado || busy || disabled) return
    setBusy(true)
    setError('')
    try {
      await requestCaixa('gestao', 'POST', { pedidoId, clienteId: selecionado.id })
      await onSaved()
    } catch (error) {
      if (error instanceof CaixaRequestError && error.status === 401) expire()
      setError(error instanceof Error ? error.message : 'Não foi possível vincular o cliente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="my-3 rounded-xl border p-3">
      <summary className="cursor-pointer font-medium">Vincular cliente para fidelidade</summary>
      <div className="mt-3 grid gap-3">
        <CaixaCustomerPicker disabled={disabled || busy} onSelect={setSelecionado} onExpire={expire} />
        {selecionado && <p className="text-sm">Cliente selecionado: <strong>{selecionado.nome}</strong>
          {selecionado.telefoneFinal && ' · Telefone final ' + selecionado.telefoneFinal}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" className="min-h-11 justify-self-start" disabled={disabled || busy || !selecionado} onClick={vincular}>
          {busy ? 'Vinculando…' : 'Confirmar vínculo'}
        </Button>
      </div>
    </details>
  )
}

function MovementForm({ venda, disabled, run }: { venda: VendaDetalhe; disabled: boolean; run: (operacao: OperacaoCaixa) => void }) {
  const [operacao, setOperacao] = useState<OperacaoCaixa['operacao']>('DEVOLUCAO')
  const [apto, setApto] = useState(false)
  const [error, setError] = useState('')
  const opcoes: OperacaoCaixa['operacao'][] = ['DEVOLUCAO']
  if (venda.statusPagamento === 'PENDENTE') opcoes.unshift('BAIXA', 'CANCELAMENTO')
  if (venda.statusPagamento === 'APROVADO') opcoes.unshift('CORRECAO', 'ESTORNO')
  const hasMeio = operacao === 'BAIXA' || operacao === 'CORRECAO'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const base = { operacao, pedidoId: venda.id, tentativa: crypto.randomUUID() }
    const motivo = fields.get('motivo')
    const meio = fields.get('meio')
    const taxa = fields.get('taxa')
    const versao = venda.caixaRecebimentoAtualId
    const payload = operacao === 'BAIXA' ? { ...base, meio }
      : operacao === 'CORRECAO' ? { ...base, motivo, meio, versao, ...(taxa ? { taxa: Number(taxa) } : {}) }
      : operacao === 'ESTORNO' ? { ...base, motivo, versao, reabrir: fields.get('destino') === 'reabrir' }
      : operacao === 'CANCELAMENTO' ? { ...base, motivo }
      : { ...base, motivo, aptoParaVenda: apto, itens: venda.itens.map(({ produtoId }) => ({
        produtoId, quantidade: Number(fields.get(produtoId)),
      })).filter((item) => item.quantidade > 0) }
    const result = operacaoCaixa.safeParse(payload)
    if (!result.success) return setError('Confira o motivo, os valores e a confirmação da operação.')
    setError('')
    run(result.data)
  }

  return (
    <form onSubmit={submit} className="mt-3 max-w-md border-t pt-3">
      <fieldset disabled={disabled} className="grid gap-2">
        <Label htmlFor="gestao-acao">Operação</Label>
        <select id="gestao-acao" value={operacao} onChange={(event) => setOperacao(event.target.value as OperacaoCaixa['operacao'])}
          className="h-10 rounded-md border bg-background px-2">
          {opcoes.map((opcao) => <option key={opcao} value={opcao}>{actions[opcao]}</option>)}
        </select>
        {hasMeio && <>
          <Label htmlFor="gestao-meio">Meio efetivo</Label>
          <select name="meio" id="gestao-meio" defaultValue={venda.meio} className="h-10 rounded-md border bg-background px-2">
            {meiosCaixa.map((meio) => <option key={meio} value={meio}>{meioCaixaLabel[meio]}</option>)}
          </select>
        </>}
        {operacao === 'CORRECAO' && <>
          <Label htmlFor="gestao-taxa">Taxa corrigida em centavos (opcional)</Label>
          <Input id="gestao-taxa" name="taxa" type="number" min={0} max={venda.total} step={1} />
        </>}
        {operacao === 'ESTORNO' && <>
          <Label htmlFor="gestao-destino">Após devolver o pagamento</Label>
          <select id="gestao-destino" name="destino" defaultValue="" required className="h-10 rounded-md border bg-background px-2">
            <option value="" disabled>Selecione o destino</option><option value="reabrir">Reabrir a dívida</option><option value="encerrar">Encerrar a venda</option>
          </select>
          <p className="text-sm text-muted-foreground">A saída será registrada hoje. O saldo físico só muda por devolução separada.</p>
        </>}
        {operacao === 'DEVOLUCAO' && <>
          {venda.itens.map((item) => <div key={item.produtoId} className="flex items-center justify-between gap-2">
            <Label htmlFor={item.produtoId}>{item.nomeProdutoSnapshot} · {item.quantidade} vendidos</Label>
            <Input id={item.produtoId} name={item.produtoId} type="number" min={0} max={item.quantidade} defaultValue={0} className="w-20" />
          </div>)}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={apto} onCheckedChange={(checked) => setApto(checked === true)} /> Confirmo que os itens devolvidos estão em condição de venda
          </label>
        </>}
        {operacao !== 'BAIXA' && <>
          <Label htmlFor="gestao-motivo">Motivo</Label>
          <Input id="gestao-motivo" name="motivo" minLength={3} maxLength={300} required />
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="min-h-11 justify-self-start">{actions[operacao]}</Button>
      </fieldset>
    </form>
  )
}
