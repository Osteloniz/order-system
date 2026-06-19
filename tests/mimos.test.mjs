import test from 'node:test'
import assert from 'node:assert/strict'

import { buildClienteFidelidade } from '../lib/clientes-summary.ts'
import { getMimoLogMetadata, isProdutoMimoNome, MIMO_COOKIE_THRESHOLD, MIMO_LOG_ORIGEM } from '../lib/mimos.ts'

test('buildClienteFidelidade gera mimo a cada 14 cookies', () => {
  const fidelidade = buildClienteFidelidade(14, 0)

  assert.equal(MIMO_COOKIE_THRESHOLD, 14)
  assert.equal(fidelidade.totalMimosGerados, 1)
  assert.equal(fidelidade.mimosDisponiveis, 1)
  assert.equal(fidelidade.progressoAtual, 0)
  assert.equal(fidelidade.faltamParaProximo, 14)
})

test('buildClienteFidelidade respeita mimos ja entregues', () => {
  const fidelidade = buildClienteFidelidade(31, 1)

  assert.equal(fidelidade.totalMimosGerados, 2)
  assert.equal(fidelidade.mimosEntregues, 1)
  assert.equal(fidelidade.mimosDisponiveis, 1)
  assert.equal(fidelidade.progressoAtual, 3)
  assert.equal(fidelidade.faltamParaProximo, 11)
})

test('isProdutoMimoNome reconhece o produto padrao do mimo', () => {
  assert.equal(isProdutoMimoNome('Cookie Tradicional'), true)
  assert.equal(isProdutoMimoNome('cookie tradicional classico'), true)
  assert.equal(isProdutoMimoNome('Brownie Tradicional'), false)
})

test('getMimoLogMetadata extrai apenas logs de mimo fidelidade', () => {
  const metadata = getMimoLogMetadata({
    origem: MIMO_LOG_ORIGEM,
    clienteId: 'cliente-1',
    clienteNome: 'Maria',
    valorReferencial: 1200,
    quantidadeMimo: 1,
  })

  assert.deepEqual(metadata, {
    origem: MIMO_LOG_ORIGEM,
    clienteId: 'cliente-1',
    clienteNome: 'Maria',
    produtoMimoId: undefined,
    produtoMimoNome: undefined,
    valorReferencial: 1200,
    quantidadeMimo: 1,
  })

  assert.equal(getMimoLogMetadata({ origem: 'OUTRO_EVENTO' }), null)
})
