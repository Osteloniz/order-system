import test from 'node:test'
import assert from 'node:assert/strict'

import { buildClienteFidelidade, ordenarClientesPorFidelidade } from '../lib/clientes-summary.ts'
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

test('ordenarClientesPorFidelidade ignora clientes definidos como excecao', () => {
  const clientes = ordenarClientesPorFidelidade([
    { id: 'inativo', nome: 'Excecao', telefone: null, fidelidadeAtiva: false, totalCookies: 28, totalMimosGerados: 2, mimosEntregues: 0, mimosDisponiveis: 2, progressoAtual: 0, faltamParaProximo: 14 },
    { id: 'proximo', nome: 'Quase la', telefone: null, fidelidadeAtiva: true, totalCookies: 13, totalMimosGerados: 0, mimosEntregues: 0, mimosDisponiveis: 0, progressoAtual: 13, faltamParaProximo: 1 },
    { id: 'mimo', nome: 'Com mimo', telefone: null, fidelidadeAtiva: true, totalCookies: 14, totalMimosGerados: 1, mimosEntregues: 0, mimosDisponiveis: 1, progressoAtual: 0, faltamParaProximo: 14 },
  ])

  assert.deepEqual(clientes.map((cliente) => cliente.id), ['mimo', 'proximo'])
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
