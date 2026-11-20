'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { formatarMoeda } from '@/lib/calc'
import { meiosCaixa, meioCaixaLabel, type MeioCaixa } from '@/lib/caixa-contract'
import { CaixaRequestError, requestCaixa, type PendenciaCaixa } from '@/components/admin/caixa-client'
import { useCaixaMovement } from '@/components/admin/use-caixa-movement'

export function CaixaPendencias({ storageKey, expire }: { storageKey: string; expire: () => void }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [meio, setMeio] = useState<MeioCaixa>('PIX')
  const { data, error, mutate } = useSWR([storageKey, cursor ? 'vendas?cursor=' + cursor : 'vendas'] as const, ([, path]) =>
    requestCaixa<{ vendas: PendenciaCaixa[]; cursor: string | null }>(path), {
    shouldRetryOnError: false,
    onError: (error) => { if (error instanceof CaixaRequestError && error.status === 401) expire() },
  })
  const movement = useCaixaMovement(storageKey, expire, () => { void mutate() })

  return (
    <section className="max-w-3xl rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="caixa-pendencias">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="caixa-pendencias" className="text-lg font-semibold">Recebimentos pendentes</h2>
        <Button variant="outline" onClick={() => mutate()}>Atualizar</Button>
      </div>
      {movement.message && <p role="status" className="mb-3 rounded-lg border bg-muted p-2 text-sm">{movement.message}</p>}
      {movement.pending && <Button className="mb-3" disabled={movement.busy} onClick={() => movement.pending && movement.run(movement.pending)}>Consultar tentativa de baixa</Button>}
      {!data && <p role={error ? 'alert' : 'status'} className="text-sm text-muted-foreground">{error ? 'Falha ao carregar pendências.' : 'Carregando pendências…'}</p>}
      {data?.vendas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pendência nesta página.</p>}
      <ul className="divide-y">
        {data?.vendas.map((venda) => (
          <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={venda.id}>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{venda.clienteNome} · #{venda.numero}</p>
              <p className="text-xs text-muted-foreground">
                {venda.telefoneFinal && 'Final ' + venda.telefoneFinal + ' · '}{meioCaixaLabel[venda.meio]} previsto
              </p>
            </div>
            <div className="flex items-center gap-2">
              <strong className="text-sm tabular-nums">{formatarMoeda(venda.total)}</strong>
              <AlertDialog onOpenChange={(open) => { if (open) setMeio(venda.meio) }}>
                <AlertDialogTrigger asChild><Button variant="outline" className="min-h-11" disabled={movement.busy || !!movement.pending}>Dar baixa</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar recebimento</AlertDialogTitle>
                    <AlertDialogDescription>Confira o recebimento integral de {formatarMoeda(venda.total)} para a venda #{venda.numero}.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid gap-2">
                    <Label htmlFor="meio-baixa">Meio efetivamente recebido</Label>
                    <select id="meio-baixa" value={meio} onChange={(event) => setMeio(event.target.value as MeioCaixa)} className="h-11 rounded-md border bg-background px-2">
                      {meiosCaixa.map((value) => <option key={value} value={value}>{meioCaixaLabel[value]}</option>)}
                    </select>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => movement.run({ operacao: 'BAIXA', pedidoId: venda.id, meio, tentativa: crypto.randomUUID() })}>Confirmar baixa</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        ))}
      </ul>
      {(cursor || data?.cursor) && <div className="mt-3 flex gap-2">
        {cursor && <Button variant="outline" onClick={() => setCursor(null)}>Início da lista</Button>}
        {data?.cursor && <Button variant="outline" onClick={() => setCursor(data.cursor)}>Próxima página</Button>}
      </div>}
    </section>
  )
}
