import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { encryptTotpSecret, generateTotpCode, generateTotpSecret } from '../lib/totp.ts'

const base = new URL(process.env.CAIXA_TEST_URL ?? 'http://127.0.0.1:3411')
assert.equal(base.hostname, '127.0.0.1', 'Execute a aplicação de teste em loopback.')
const hml = parseEnv(readFileSync('.env', 'utf8'))
const prd = parseEnv(readFileSync('.env.prod', 'utf8'))
const url = process.env.DATABASE_URL
assert(url, 'Aponte DATABASE_URL explicitamente para LOCAL ou HML.')
const endpoint = (value) => new URL(value).hostname.replace('-pooler.', '.')
assert(![prd.DATABASE_URL, prd.DIRECT_URL].some((value) => endpoint(value) === endpoint(url)), 'PRD não aceita fixtures.')
assert(endpoint(url) === '127.0.0.1' || url === hml.DATABASE_URL, 'Banco de teste não identificado.')
process.loadEnvFile('.env')
const db = new PrismaClient({ datasourceUrl: url })
const suffix = randomBytes(4).toString('hex')
const senha = 'Fixture-' + randomBytes(18).toString('hex') + '-9T'
const tenantIds = []
const createdTenantIds = []
const userIds = []
const categoryIds = []
const productIds = []
const buyerIds = []
const saleIds = []
const legacySaleIds = []
let initialTheme

function client() {
  const jar = new Map()
  return {
    cookie() { return Array.from(jar, ([key, value]) => key + '=' + value).join('; ') },
    async send(path, method = 'GET', body, extra = {}) {
      const res = await fetch(new URL(path, base), {
        method, redirect: 'manual',
        headers: { cookie: this.cookie(), origin: base.origin,
          ...(body !== undefined && { 'Content-Type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json' }),
          ...extra },
        body: body === undefined ? undefined : body instanceof URLSearchParams ? body : JSON.stringify(body),
      })
      for (const header of res.headers.getSetCookie()) {
        const [pair] = header.split(';')
        const i = pair.indexOf('=')
        if (pair.slice(i + 1)) jar.set(pair.slice(0, i), pair.slice(i + 1))
        else jar.delete(pair.slice(0, i))
      }
      const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null
      return { status: res.status, data, headers: res.headers }
    },
  }
}

async function expect(promise, status, label) {
  const result = await promise
  assert.equal(result.status, status, label + ' ' + (result.data?.error ?? ''))
  return result.data
}

async function account(tenantId, role, passwordHash, totp, loginSuffix = '') {
  const data = await db.adminUser.create({ data: {
    tenantId, role, nome: 'Fixture Caixa ' + suffix, username: 'fixture-' + role.toLowerCase() + '-' + suffix + loginSuffix,
    passwordHash, ...(totp && { totpEnabledAt: new Date(), totpSecretEncrypted: encryptTotpSecret(totp) }),
  } })
  userIds.push(data.id)
  return data
}

function quote(id, price, quantidade) {
  return createHash('sha256').update(JSON.stringify([[id, quantidade, price]])).digest('hex')
}
const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const today = day(new Date())
const yesterday = day(new Date(Date.now() - 86_400_000))

try {
  let tenant = await db.tenant.findUnique({ where: { slug: 'brookie-pregiato' } })
  if (!tenant) {
    tenant = await db.tenant.create({ data: { slug: 'brookie-pregiato', nome: 'Fixture Brookie' } })
    createdTenantIds.push(tenant.id)
  }
  const outro = await db.tenant.create({ data: { slug: 'fixture-caixa-' + suffix, nome: 'Fixture isolada' } })
  createdTenantIds.push(outro.id)
  tenantIds.push(tenant.id, outro.id)
  const passwordHash = await bcrypt.hash(senha, 12)
  const totp = generateTotpSecret()
  const master = await account(tenant.id, 'MASTER', passwordHash, totp)
  const operador = await account(tenant.id, 'CAIXA', passwordHash)
  const operadorOutro = await account(outro.id, 'CAIXA', passwordHash)
  const enrollment = await account(tenant.id, 'ADMIN', passwordHash)

  const cookieCaixa = client()
  const login = () => expect(cookieCaixa.send('/api/caixa/acesso', 'POST', { login: operador.username, tenant: tenant.slug, senha }), 200, 'login CAIXA')
  const cookieOutro = client()
  await expect(cookieOutro.send('/api/caixa/acesso', 'POST', { login: operadorOutro.username, tenant: outro.slug, senha }), 200, 'login do outro tenant')
  await login()

  const admin = client()
  const challenge = await expect(admin.send('/api/auth/admin/password', 'POST', { identifier: master.username, password: senha }), 200, 'senha MASTER')
  assert.equal(challenge.enrollmentRequired, false)
  await expect(admin.send('/api/admin/tema'), 401, 'segundo fator obrigatório')
  const csrf = await expect(admin.send('/api/auth/csrf'), 200, 'csrf NextAuth')
  const loginAdmin = await admin.send('/api/auth/callback/credentials', 'POST', new URLSearchParams({
    csrfToken: csrf.csrfToken, flow: 'mfa', code: generateTotpCode(totp), callbackUrl: base.origin + '/admin', json: 'true',
  }))
  assert([200, 302].includes(loginAdmin.status))
  await expect(admin.send('/api/admin/tema'), 200, 'MASTER com MFA')

  const legacyEnrollment = client()
  const enrollmentChallenge = await expect(legacyEnrollment.send('/api/auth/admin/password', 'POST', { identifier: enrollment.username, password: senha }), 200, 'senha ADMIN legado')
  assert.equal(enrollmentChallenge.enrollmentRequired, true)
  const enrollCsrf = await expect(legacyEnrollment.send('/api/auth/csrf'), 200, 'csrf enrollment')
  await legacyEnrollment.send('/api/auth/callback/credentials', 'POST', new URLSearchParams({
    csrfToken: enrollCsrf.csrfToken, flow: 'enroll', callbackUrl: base.origin + '/admin/seguranca', json: 'true',
  }))
  await expect(legacyEnrollment.send('/api/admin/tema'), 401, 'enrollment sem acesso à gestão')
  await expect(legacyEnrollment.send('/api/caixa/catalogo'), 401, 'enrollment sem acesso ao Caixa')
  const adminRedirect = await legacyEnrollment.send('/admin')
  assert.equal(new URL(adminRedirect.headers.get('location'), base).pathname, '/admin/seguranca')

  for (const path of ['/api/admin/pedidos', '/api/admin/caixa-contas', '/api/admin/tema']) {
    await expect(cookieCaixa.send(path), 403, 'CAIXA isolado ' + path)
  }
  await expect(cookieCaixa.send('/api/caixa/gestao?numero=00112233'), 403, 'gestão exige MFA')
  await expect(cookieCaixa.send('/api/caixa/acesso', 'PATCH', undefined, { origin: 'https://example.invalid' }), 403, 'origem')
  console.log('OK MFA, enrollment restrito, allowlist e origem')

  const cat = await db.categoria.create({ data: { tenantId: tenant.id, nome: 'Cookies Fixture ' + suffix, ordem: 10000 } })
  categoryIds.push(cat.id)
  const item = await db.produto.create({ data: { tenantId: tenant.id, nome: 'Cookie Tradicional Fixture ' + suffix, categoriaId: cat.id, preco: 777, ordem: 10000 } })
  productIds.push(item.id)
  const sku = { tenantId_produtoId: { tenantId: tenant.id, produtoId: item.id } }
  const quantity = async () => (await db.produtoEstoque.findUniqueOrThrow({ where: sku })).quantidadeDisponivel
  await db.produtoEstoque.create({ data: { tenantId: tenant.id, produtoId: item.id, quantidadeDisponivel: 60 } })
  const catalogo = await expect(cookieCaixa.send('/api/caixa/catalogo'), 200, 'catálogo')
  assert(catalogo.produtos.some((p) => p.id === item.id))
  const catalogoOutro = await expect(cookieOutro.send('/api/caixa/catalogo'), 200, 'catálogo isolado')
  assert(!catalogoOutro.produtos.some((p) => p.id === item.id))

  const telefone = '119' + String(parseInt(suffix, 16) % 100_000_000).padStart(8, '0')
  assert.equal(await db.cliente.count({ where: { tenantId: tenant.id, telefone } }), 0)
  const registros = await Promise.all(['Teste Caixa A', 'Teste Caixa B'].map((nome) =>
    cookieCaixa.send('/api/caixa/clientes', 'POST', { nome, telefone })))
  buyerIds.push(...registros.filter((r) => r.status === 201).map((r) => r.data.cliente.id))
  assert.deepEqual(registros.map((r) => r.status).sort(), [200, 201])
  const cliente = registros[0].data.cliente
  assert.equal(registros[1].data.cliente.id, cliente.id)
  assert.equal(registros[1].data.cliente.nome, cliente.nome)

  function payload({ meio = 'PIX', pago = true, clienteId = null, quantidade = 1, preco = 777, itens } = {}) {
    return { meio, pago, clienteId, tentativa: randomUUID(), cotacao: quote(item.id, preco, quantidade),
      itens: itens ?? [{ produtoId: item.id, quantidade }] }
  }
  async function vender(pedido, status = 200) {
    const result = await expect(cookieCaixa.send('/api/caixa/vendas', 'POST', pedido), status, 'concluir venda')
    if (status === 200) saleIds.push(result.pedidoId)
    return result
  }
  await vender(payload({ pago: false }), 422)
  await vender({ ...payload(), total: 1 }, 400)
  await vender({ ...payload(), observacao: 'x'.repeat(1001) }, 400)
  await vender(payload({ preco: 776 }), 409)
  assert.equal(await quantity(), 60)
  await db.produto.update({ where: { id: item.id }, data: { ativo: false } })
  await vender(payload(), 409)
  await db.produto.update({ where: { id: item.id }, data: { ativo: true, descontinuado: true } })
  await vender(payload(), 409)
  await db.produto.update({ where: { id: item.id }, data: { descontinuado: false } })
  assert.equal(await quantity(), 60)

  const extra = await db.produto.create({ data: { tenantId: tenant.id, nome: 'Segundo cookie fixture ' + suffix, categoriaId: cat.id, preco: 888, ordem: 10001 } })
  const brinde = await db.produto.create({ data: { tenantId: tenant.id, nome: 'Brinde fixture ' + suffix, categoriaId: cat.id, preco: 1, ordem: 10002 } })
  productIds.push(extra.id, brinde.id)
  await db.produtoEstoque.createMany({ data: [extra.id, brinde.id].map((produtoId) => ({ tenantId: tenant.id, produtoId, quantidadeDisponivel: 2 })) })
  await vender({ ...payload(), cotacao: quote(brinde.id, 1, 1), itens: [{ produtoId: brinde.id, quantidade: 1 }] }, 409)
  const duasLinhas = [{ produtoId: item.id, quantidade: 1 }, { produtoId: extra.id, quantidade: 1 }]
  const cotacaoAntes = await expect(cookieCaixa.send('/api/caixa/cotacao', 'POST', duasLinhas), 200, 'cotação com dois itens')
  await db.$transaction([
    db.produto.update({ where: { id: item.id }, data: { preco: 778 } }),
    db.produto.update({ where: { id: extra.id }, data: { preco: 887 } }),
  ])
  const precoMudou = await vender({ ...payload(), itens: duasLinhas, cotacao: cotacaoAntes.cotacao }, 409)
  assert.equal(precoMudou.novaCotacao.total, cotacaoAntes.total)
  assert.notEqual(precoMudou.novaCotacao.cotacao, cotacaoAntes.cotacao)
  await db.produto.update({ where: { id: item.id }, data: { preco: 777 } })

  const { caixaTaxaCreditoBp, caixaTaxaDebitoBp } = await expect(admin.send('/api/admin/caixa-taxas'), 200, 'taxas da loja')
  const paidMethods = [
    { meio: 'PIX', pagamento: 'PIX', tipoCartao: null, taxa: 0 },
    { meio: 'CREDITO', pagamento: 'CARTAO', tipoCartao: 'CREDITO', taxa: Math.round(777 * caixaTaxaCreditoBp / 10_000) },
    { meio: 'DEBITO', pagamento: 'CARTAO', tipoCartao: 'DEBITO', taxa: Math.round(777 * caixaTaxaDebitoBp / 10_000) },
    { meio: 'DINHEIRO', pagamento: 'DINHEIRO', tipoCartao: null, taxa: 0 },
  ]
  const getContas = (data) => admin.send('/api/admin/financeiro/contas-receber?from=' + data + '&to=' + data)
  const fluxo = (date) => expect(admin.send('/api/admin/financeiro/fluxo-caixa?from=' + date + '&to=' + date), 200, 'fluxo ' + date)
  const relatorio = (date) => expect(admin.send('/api/admin/relatorios?from=' + date + '&to=' + date), 200, 'relatório ' + date)
  const [fluxoAntesQuatroMeios, relAntesQuatroMeios] = await Promise.all([fluxo(today), relatorio(today)])
  const pendentes = []
  const vendasPagas = []
  const observacao = 'Separar em duas embalagens.'
  for (const { meio } of paidMethods) {
    const pagamento = payload({ meio })
    if (meio === 'PIX') {
      const pedidoComNota = await vender({ ...pagamento, observacao: '  ' + observacao + '  ' })
      vendasPagas.push(pedidoComNota)
      const retryComNota = await vender({ ...pagamento, observacao })
      assert.equal(retryComNota.pedidoId, pedidoComNota.pedidoId)
      await vender({ ...pagamento, observacao: 'Outra observação' }, 409)
      const consulta = await expect(admin.send('/api/caixa/gestao?numero=' + pedidoComNota.numero), 200, 'observação interna')
      assert.equal(consulta.vendas.find((item) => item.id === pedidoComNota.pedidoId)?.observacoesPedido, observacao)
    } else {
      vendasPagas.push(await vender(pagamento))
    }
    pendentes.push(await vender(payload({ meio, pago: false, clienteId: cliente.id })))
  }
  assert.equal(await quantity(), 52)
  const [contasQuatroMeios, fluxoQuatroMeios, relQuatroMeios] = await Promise.all([
    expect(getContas(today), 200, 'contas a receber dos quatro meios'), fluxo(today), relatorio(today),
  ])
  for (const [index, method] of paidMethods.entries()) {
    const linhaPaga = contasQuatroMeios.contas.find((row) => row.numero === vendasPagas[index].numero)
    assert.equal(linhaPaga?.statusFinanceiro, 'REALIZADO', method.meio)
    assert.equal(linhaPaga.pagamento, method.pagamento)
    assert.equal(linhaPaga.tipoCartao, method.tipoCartao)
    assert.equal(linhaPaga.total, 777)
    assert.equal(linhaPaga.taxa, method.taxa)
    assert.equal(linhaPaga.liquido, 777 - method.taxa)
    const linhaPendente = contasQuatroMeios.contas.find((row) => row.numero === pendentes[index].numero)
    assert.equal(linhaPendente?.statusFinanceiro, 'PREVISTO', method.meio)
    assert.equal(linhaPendente.total, 777)
    assert.equal(linhaPendente.taxa, method.taxa)
    assert.equal(linhaPendente.liquido, 777 - method.taxa)
  }
  const brutoQuatroMeios = 777 * paidMethods.length
  const taxaQuatroMeios = paidMethods.reduce((total, method) => total + method.taxa, 0)
  const liquidoQuatroMeios = brutoQuatroMeios - taxaQuatroMeios
  assert.equal(fluxoQuatroMeios.resumo.entradasRealizadas - fluxoAntesQuatroMeios.resumo.entradasRealizadas, liquidoQuatroMeios)
  assert.equal(fluxoQuatroMeios.resumo.taxasRealizadas - fluxoAntesQuatroMeios.resumo.taxasRealizadas, taxaQuatroMeios)
  assert.equal(fluxoQuatroMeios.resumo.entradasPrevistas - fluxoAntesQuatroMeios.resumo.entradasPrevistas, liquidoQuatroMeios)
  assert.equal(fluxoQuatroMeios.resumo.taxasPrevistas - fluxoAntesQuatroMeios.resumo.taxasPrevistas, taxaQuatroMeios)
  assert.equal(relQuatroMeios.recebimentoRealizado - relAntesQuatroMeios.recebimentoRealizado, brutoQuatroMeios)
  assert.equal(relQuatroMeios.taxaCartaoRealizada - relAntesQuatroMeios.taxaCartaoRealizada, taxaQuatroMeios)
  assert.equal(relQuatroMeios.recebimentoLiquido - relAntesQuatroMeios.recebimentoLiquido, liquidoQuatroMeios)
  assert.equal(relQuatroMeios.recebimentoPrevisto - relAntesQuatroMeios.recebimentoPrevisto, brutoQuatroMeios)
  assert.equal(relQuatroMeios.taxaCartaoPrevista - relAntesQuatroMeios.taxaCartaoPrevista, taxaQuatroMeios)
  console.log('OK quatro meios realizados e previstos nas três visões financeiras')
  const pendencia = pendentes[3]
  await expect(cookieOutro.send('/api/caixa/movimentos', 'POST', { operacao: 'BAIXA', pedidoId: pendencia.pedidoId, meio: 'PIX', tentativa: randomUUID() }), 404, 'baixa fora do tenant')
  assert.equal((await expect(cookieOutro.send('/api/caixa/vendas'), 200, 'pendências do outro tenant')).vendas.length, 0)

  const duplicado = payload({ quantidade: 2, itens: [{ produtoId: item.id, quantidade: 1 }, { produtoId: item.id, quantidade: 1 }] })
  const venda = await vender(duplicado)
  const tokenAnterior = cookieCaixa.cookie()
  await expect(cookieCaixa.send('/api/caixa/acesso', 'DELETE'), 200, 'logout explícito')
  await expect(client().send('/api/caixa/catalogo', 'GET', undefined, { cookie: tokenAnterior }), 401, 'cookie rejeitado após logout')
  await login()
  const replay = await vender({ ...duplicado, itens: [{ produtoId: item.id, quantidade: 2 }] })
  assert.equal(replay.pedidoId, venda.pedidoId)
  assert.equal((await vender({ ...duplicado, observacao: '   ' })).pedidoId, venda.pedidoId)
  await vender({ ...duplicado, meio: 'DINHEIRO' }, 409)
  assert.equal(await quantity(), 50)
  const entregue = await db.pedido.findUniqueOrThrow({ where: { id: venda.pedidoId } })
  assert.equal(entregue.status, 'ENTREGUE')
  assert.equal(entregue.tipoEntrega, 'RETIRADA')
  assert.equal(entregue.origem, 'CAIXA_EXPRESS')
  assert(entregue.estoqueBaixadoEm)
  assert.equal(await db.caixaEvento.count({ where: { pedidoId: venda.pedidoId } }), 1)
  for (const [path, method, data] of [
    ['/api/pedidos/' + venda.pedidoId, 'GET'],
    ['/api/pedidos/' + venda.pedidoId + '/pagamento', 'POST', {}],
    ['/api/admin/pedidos/' + venda.pedidoId, 'DELETE'],
    ['/api/admin/pedidos/' + venda.pedidoId + '/status', 'PATCH', { status: 'CANCELADO' }],
  ]) {
    const resultado = await (path.startsWith('/api/admin') ? admin : client()).send(path, method, data)
    assert(resultado.status >= 400, 'Proteção de origem de ' + path)
  }

  await db.pedido.update({ where: { id: pendencia.pedidoId }, data: { entregueEm: new Date(yesterday + 'T12:00:00-03:00'), criadoEm: new Date(yesterday + 'T12:00:00-03:00') } })
  const antes = await expect(getContas(yesterday), 200, 'contas a receber previstas')
  assert.equal(antes.contas.find((row) => row.numero === pendencia.numero)?.statusFinanceiro, 'PREVISTO')
  const [fluxoAntesHoje, fluxoAntesOntem, relAntesHoje, relAntesOntem] = await Promise.all([
    fluxo(today), fluxo(yesterday), relatorio(today), relatorio(yesterday),
  ])
  const movimento = { operacao: 'BAIXA', pedidoId: pendencia.pedidoId, meio: 'DEBITO', tentativa: randomUUID() }
  const disputa = await Promise.all([
    cookieCaixa.send('/api/caixa/movimentos', 'POST', movimento),
    admin.send('/api/caixa/movimentos', 'POST', { ...movimento, tentativa: randomUUID(), meio: 'CREDITO' }),
  ])
  assert.deepEqual(disputa.map((r) => r.status).sort(), [200, 409])
  const confirmado = disputa.find((r) => r.status === 200).data
  const recebimento = await db.pedido.findUniqueOrThrow({ where: { id: pendencia.pedidoId } })
  assert.equal(recebimento.statusPagamento, 'APROVADO')
  assert.equal(recebimento.caixaPagamentoPrevisto, 'DINHEIRO')
  assert.equal(await quantity(), 50)
  const contasHoje = await expect(getContas(today), 200, 'realizado no dia do recebimento')
  assert.equal(contasHoje.contas.find((row) => row.numero === pendencia.numero)?.tipoCartao, confirmado.meio)
  const contasOntem = await expect(getContas(yesterday), 200, 'previsto encerrado no dia da entrega')
  assert.equal(contasOntem.contas.some((row) => row.numero === pendencia.numero), false)
  const taxaEfetiva = paidMethods.find(({ meio }) => meio === confirmado.meio).taxa
  const contaQuitada = contasHoje.contas.find((row) => row.numero === pendencia.numero)
  assert.equal(contaQuitada.taxa, taxaEfetiva)
  assert.equal(contaQuitada.liquido, 777 - taxaEfetiva)
  const [fluxoDepoisHoje, fluxoDepoisOntem, relDepoisHoje, relDepoisOntem] = await Promise.all([
    fluxo(today), fluxo(yesterday), relatorio(today), relatorio(yesterday),
  ])
  assert.equal(fluxoDepoisHoje.resumo.entradasRealizadas - fluxoAntesHoje.resumo.entradasRealizadas, 777 - taxaEfetiva)
  assert.equal(fluxoDepoisHoje.resumo.taxasRealizadas - fluxoAntesHoje.resumo.taxasRealizadas, taxaEfetiva)
  assert.equal(fluxoAntesOntem.resumo.entradasPrevistas - fluxoDepoisOntem.resumo.entradasPrevistas, 777)
  assert.equal(relDepoisHoje.recebimentoRealizado - relAntesHoje.recebimentoRealizado, 777)
  assert.equal(relDepoisHoje.taxaCartaoRealizada - relAntesHoje.taxaCartaoRealizada, taxaEfetiva)
  assert.equal(relDepoisHoje.recebimentoLiquido - relAntesHoje.recebimentoLiquido, 777 - taxaEfetiva)
  assert.equal(relDepoisOntem.receitaTotal, relAntesOntem.receitaTotal)
  assert.equal(relAntesOntem.recebimentoPrevisto - relDepoisOntem.recebimentoPrevisto, 777)

  const corrigir = { operacao: 'CORRECAO', pedidoId: pendencia.pedidoId, meio: 'PIX', tentativa: randomUUID(),
    motivo: 'Fixture correção de meio', versao: recebimento.caixaRecebimentoAtualId }
  await expect(cookieCaixa.send('/api/caixa/movimentos', 'POST', corrigir), 403, 'correção exige MFA')
  await expect(admin.send('/api/caixa/movimentos', 'POST', corrigir), 200, 'correção financeira')
  const contaCorrigida = (await expect(getContas(today), 200, 'conta corrigida')).contas.filter((row) => row.numero === pendencia.numero)
  assert.equal(contaCorrigida.length, 1)
  assert.equal(contaCorrigida[0].pagamento, 'PIX')
  const corrigido = await db.pedido.findUniqueOrThrow({ where: { id: pendencia.pedidoId } })
  const estorno = { operacao: 'ESTORNO', pedidoId: pendencia.pedidoId, tentativa: randomUUID(), motivo: 'Fixture estorno',
    reabrir: true, versao: corrigido.caixaRecebimentoAtualId }
  const [antesDeEstornar, relAntesEstorno] = await Promise.all([fluxo(today), relatorio(today)])
  await expect(admin.send('/api/caixa/movimentos', 'POST', estorno), 200, 'estorno reabre dívida')
  const [depoisDeEstornar, relDepoisEstorno] = await Promise.all([fluxo(today), relatorio(today)])
  assert.equal(depoisDeEstornar.resumo.saidasRealizadas - antesDeEstornar.resumo.saidasRealizadas, 777)
  assert.equal(relDepoisEstorno.estornosCaixa - relAntesEstorno.estornosCaixa, 777)
  const comEstorno = (await expect(getContas(today), 200, 'saída efetiva')).contas.filter((row) => row.numero === pendencia.numero)
  assert(comEstorno.some((row) => row.statusFinanceiro === 'ESTORNADO' && row.total === -777))
  await expect(admin.send('/api/caixa/movimentos', 'POST', { operacao: 'CANCELAMENTO', pedidoId: pendencia.pedidoId,
    motivo: 'Fixture cancelamento', tentativa: randomUUID() }), 200, 'cancelar pendência')
  const devolver = { operacao: 'DEVOLUCAO', pedidoId: pendencia.pedidoId, tentativa: randomUUID(), motivo: 'Fixture devolução',
    aptoParaVenda: true, itens: [{ produtoId: item.id, quantidade: 1 }] }
  await expect(admin.send('/api/caixa/movimentos', 'POST', devolver), 200, 'reposição')
  await expect(admin.send('/api/caixa/movimentos', 'POST', devolver), 200, 'retry de reposição')
  await expect(admin.send('/api/caixa/movimentos', 'POST', { ...devolver, tentativa: randomUUID() }), 409, 'reposição excedente')
  assert.equal(await quantity(), 51)
  console.log('OK quatro meios, vínculo, preços, retry, baixa, competência, matriz financeira e devolução')

  await vender(payload({ clienteId: cliente.id, quantidade: 13 }))
  const getCustomer = () => expect(admin.send('/api/admin/clientes/' + cliente.id), 200, 'perfil')
  assert.equal((await getCustomer()).resumoFidelidade.mimosDisponiveis, 0)
  const umaPendente = await vender(payload({ clienteId: cliente.id, pago: false }))
  assert.equal((await getCustomer()).resumoFidelidade.mimosDisponiveis, 0)
  await expect(cookieCaixa.send('/api/caixa/movimentos', 'POST', { operacao: 'BAIXA', pedidoId: umaPendente.pedidoId,
    meio: 'PIX', tentativa: randomUUID() }), 200, 'compra elegível após baixa')
  assert.equal((await getCustomer()).resumoFidelidade.mimosDisponiveis, 1)

  if (endpoint(url) === '127.0.0.1') {
    const resgates = await Promise.all([1, 2].map(() => admin.send('/api/admin/clientes/' + cliente.id + '/mimo', 'POST')))
    assert.deepEqual(resgates.map((r) => r.status).sort(), [200, 400])
    const pago = await db.pedido.findUniqueOrThrow({ where: { id: umaPendente.pedidoId } })
    await expect(admin.send('/api/caixa/movimentos', 'POST', { operacao: 'ESTORNO', pedidoId: pago.id,
      tentativa: randomUUID(), motivo: 'Fixture após resgate', reabrir: false, versao: pago.caixaRecebimentoAtualId }), 200, 'estorno após resgate')
    assert.equal((await getCustomer()).resumoFidelidade.mimosEntregues, 1)
    assert.equal((await getCustomer()).resumoFidelidade.faltamParaProximo, 15)
    console.log('OK resgates simultâneos e recomposição após estorno em LOCAL')
  }



  await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 1 } })
  const last = await Promise.all([payload(), payload()].map((pedido) => cookieCaixa.send('/api/caixa/vendas', 'POST', pedido)))
  assert.deepEqual(last.map((r) => r.status).sort(), [200, 409])
  saleIds.push(last.find((r) => r.status === 200).data.pedidoId)
  assert.equal(await quantity(), 0)
  const result = await expect(admin.send('/api/admin/kds'), 200, 'KDS acessível')
  assert(!JSON.stringify(result).includes(venda.pedidoId))

  await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 1 } })
  const ajustar = (saldoConfirmado) => admin.send('/api/admin/producao', 'PATCH', {
    action: 'SET_STOCK', produtoId: item.id, quantidadeDisponivel: 0, saldoConfirmado, adminPassword: senha,
  })
  await expect(ajustar(1), 200, 'ajuste absoluto antes do Caixa')
  await vender(payload(), 409)
  await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 1 } })
  await vender(payload())
  await expect(ajustar(1), 409, 'ajuste absoluto exige nova confirmação depois do Caixa')

  const manual = () => expect(admin.send('/api/admin/pedidos', 'POST', {
    clienteId: cliente.id, clienteNome: 'Cliente fixture', pagamento: 'DINHEIRO', tipoEntrega: 'RETIRADA',
    criadoEm: yesterday + 'T12:00:00-03:00', itens: [{ produtoId: item.id, quantidade: 1 }],
  }), 201, 'pedido manual')
  const statusManual = (id, status) => admin.send('/api/admin/pedidos/' + id + '/status', 'PATCH', { status })
  await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 1 } })
  await db.produto.update({ where: { id: item.id }, data: { ativo: false } })
  const reserva = await manual()
  legacySaleIds.push(reserva.id)
  await db.produto.update({ where: { id: item.id }, data: { ativo: true } })
  await expect(statusManual(reserva.id, 'ACEITO'), 200, 'reserva manual antes do Caixa')
  await vender(payload(), 409)
  await expect(statusManual(reserva.id, 'CANCELADO'), 200, 'liberar reserva')
  const semSaldo = await manual()
  legacySaleIds.push(semSaldo.id)
  await vender(payload())
  const semReserva = await statusManual(semSaldo.id, 'ACEITO')
  assert([400, 409].includes(semReserva.status), 'reserva respeita baixa Caixa')
  assert.equal(await quantity(), 0)

  const legadoEntregue = await manual()
  legacySaleIds.push(legadoEntregue.id)
  await db.pedido.update({ where: { id: legadoEntregue.id }, data: { status: 'ENTREGUE', estoqueBaixadoEm: new Date() } })
  const numeroLegado = legadoEntregue.id.slice(-8).toUpperCase()
  const contaLegada = (await expect(getContas(yesterday), 200, 'dinheiro legado')).contas.find((row) => row.numero === numeroLegado)
  assert.equal(contaLegada?.statusFinanceiro, 'REALIZADO')

  const fixtureCategory = await db.categoria.create({ data: { tenantId: outro.id, nome: 'Checkout fixture', ordem: 0 } })
  categoryIds.push(fixtureCategory.id)
  const produtoPublico = await db.produto.create({ data: {
    tenantId: outro.id, nome: 'Cookie teste checkout', categoriaId: fixtureCategory.id, preco: 777, ordem: 0,
  } })
  productIds.push(produtoPublico.id)
  const publico = client()
  const publicBody = { clienteNome: 'Cliente fixture checkout', clienteTelefone: '11999001199',
    pagamento: 'DINHEIRO', tipoEntrega: 'RETIRADA', itens: [{ produtoId: produtoPublico.id, quantidade: 1 }] }
  const checkoutPublico = () => publico.send('/api/pedidos', 'POST', publicBody, { cookie: 'tenant_slug=' + outro.slug })
  const vendaOutro = (quantidade) => cookieOutro.send('/api/caixa/vendas', 'POST', {
    meio: 'DINHEIRO', pago: true, clienteId: null, tentativa: randomUUID(), cotacao: quote(produtoPublico.id, 777, quantidade),
    itens: [{ produtoId: produtoPublico.id, quantidade }],
  })

  const semLinha = await Promise.all([checkoutPublico(), vendaOutro(1)])
  assert([400, 409, 422].includes(semLinha[0].status), 'Checkout sem linha de estoque')
  assert.equal(semLinha[1].status, 409, 'Caixa sem linha de estoque')
  assert.equal(await db.produtoEstoque.count({ where: { tenantId: outro.id, produtoId: produtoPublico.id } }), 0)
  await db.produtoEstoque.create({ data: { tenantId: outro.id, produtoId: produtoPublico.id, quantidadeDisponivel: 2 } })
  const publicoPrimeiro = await expect(checkoutPublico(), 201, 'checkout público cria retenção')
  legacySaleIds.push(publicoPrimeiro.id)
  const compradorPublico = await db.pedido.findUniqueOrThrow({ where: { id: publicoPrimeiro.id }, select: { clienteId: true } })
  if (compradorPublico.clienteId) buyerIds.push(compradorPublico.clienteId)
  await expect(vendaOutro(2), 409, 'Caixa respeita retenção pública')
  await expect(vendaOutro(1), 200, 'Caixa consome o saldo sem invadir retenção')
  const rejeitado = await checkoutPublico()
  assert([400, 409, 422].includes(rejeitado.status), 'checkout não invade baixa do Caixa')
  assert.equal((await db.produtoEstoque.findUniqueOrThrow({
    where: { tenantId_produtoId: { tenantId: outro.id, produtoId: produtoPublico.id } },
  })).quantidadeDisponivel, 1)
  console.log('OK retenção pública, reserva e ajuste absoluto nos dois sentidos')

  if (endpoint(url) === '127.0.0.1') {
    const functionName = 'caixa_fixture_' + suffix
    const triggerName = functionName + '_trigger'
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN IF NEW."atorId" = '${operador.id}' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END; $func$`)
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON "CaixaEvento" FOR EACH ROW EXECUTE FUNCTION ${functionName}()`)
      try {
        await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 1 } })
        const failed = payload()
        const count = await db.pedido.count({ where: { origem: 'CAIXA_EXPRESS', tenantId: tenant.id } })
        await vender(failed, 500)
        assert.equal(await quantity(), 1)
        assert.equal(await db.pedido.count({ where: { origem: 'CAIXA_EXPRESS', tenantId: tenant.id } }), count)
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER ${triggerName} ON "CaixaEvento"`)
      }
    } finally {
      await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`)
    }
    console.log('OK rollback local após falha induzida na auditoria')
  }

  initialTheme = await db.configuracao.findUnique({ where: { tenantId: tenant.id }, select: { temaVisual: true } })
  for (const temaVisual of ['NATAL', 'ANO_NOVO', 'PADRAO']) {
    await expect(admin.send('/api/admin/tema', 'PATCH', { temaVisual }), 200, 'tema ' + temaVisual)
    assert.equal((await db.configuracao.findUniqueOrThrow({ where: { tenantId: tenant.id } })).temaVisual, temaVisual)
    assert.equal(await db.configuracao.findUnique({ where: { tenantId: outro.id } }), null)
  }

  if (process.env.CAIXA_PLAYWRIGHT_MODULE && !process.env.CAIXA_FOCUSED_BROWSER_ONLY) {
    await db.produtoEstoque.update({ where: sku, data: { quantidadeDisponivel: 2 } })
    const { validarNavegador } = await import('./caixa-express.browser.mjs')
    await validarNavegador({ base, admin, caixa: cookieCaixa, produto: item.nome, pendencia: pendentes[0].numero })
  }

  const nomeBusca = 'JOÃO DE TESTE ' + suffix
  const cadastroBusca = []
  for (const [tenantId, final] of [[tenant.id, 1], [tenant.id, 2], [outro.id, 3]]) {
    const telefone = '118' + String(parseInt(suffix, 16) % 10_000_000).padStart(7, '0') + final
    const cadastro = await db.cliente.create({ data: { tenantId, nome: nomeBusca, telefone } })
    cadastroBusca.push(cadastro)
    buyerIds.push(cadastro.id)
  }
  const [primeiro, segundo, terceiro] = cadastroBusca
  const busca = (q) => cookieCaixa.send('/api/caixa/clientes?q=' + encodeURIComponent(q))
  const homonimos = await expect(busca('joao ' + suffix), 200, 'pesquisa de homônimos sem acento')
  assert.deepEqual(homonimos.clientes.map(({ id }) => id).sort(), [primeiro.id, segundo.id].sort())
  assert(homonimos.clientes.every((item) => !('telefone' in item) && item.telefoneFinal?.length === 4))
  const telefoneExato = await expect(busca('+55 ' + segundo.telefone), 200, 'busca pelo telefone com DDI')
  assert.equal(telefoneExato.clientes[0]?.id, segundo.id)
  const novoTelefone = primeiro.telefone.slice(0, -1) + '9'
  assert.equal((await expect(busca(novoTelefone), 200, 'telefone ainda não cadastrado')).cadastroRapidoTelefone, novoTelefone)
  assert.equal((await expect(busca('ausente ' + suffix), 200, 'nome não localizado')).cadastroRapidoTelefone, null)

  const vincular = (operador, pedidoId, clienteId) => operador.send('/api/caixa/gestao', 'POST', { pedidoId, clienteId })
  assert.equal(await db.cliente.count({ where: { id: { in: [primeiro.id, segundo.id] }, pedidos: { some: { id: venda.pedidoId } } } }), 0)
  await expect(vincular(cookieCaixa, venda.pedidoId, primeiro.id), 403, 'somente administração com MFA vincula venda concluída')
  await expect(vincular(admin, venda.pedidoId, terceiro.id), 404, 'cliente de outro tenant')
  await expect(vincular(admin, pendentes[0].pedidoId, primeiro.id), 409, 'pendência não pode trocar cliente')
  const antesVinculo = await db.pedido.findUniqueOrThrow({ where: { id: venda.pedidoId } })
  const estoqueAntesVinculo = await quantity()
  const concorrenciaVinculo = await Promise.all([primeiro.id, segundo.id].map((id) => vincular(admin, venda.pedidoId, id)))
  assert.deepEqual(concorrenciaVinculo.map(({ status }) => status).sort(), [200, 409])
  const vencedor = concorrenciaVinculo.find(({ status }) => status === 200).data.clienteId
  await expect(vincular(admin, venda.pedidoId, vencedor), 200, 'retry do vínculo')
  const depoisVinculo = await db.pedido.findUniqueOrThrow({ where: { id: venda.pedidoId } })
  assert.equal(depoisVinculo.clienteId, vencedor)
  for (const campo of ['statusPagamento', 'total', 'estoqueBaixadoEm', 'entregueEm', 'caixaRecebimentoAtualId']) {
    assert.deepEqual(depoisVinculo[campo], antesVinculo[campo], campo)
  }
  assert.equal(await quantity(), estoqueAntesVinculo)
  assert.equal(await db.caixaEvento.count({ where: { pedidoId: venda.pedidoId } }), 1)
  assert.equal(await db.logOperacao.count({
    where: { pedidoId: venda.pedidoId, metadata: { path: ['operacao'], equals: 'CAIXA_VINCULO_CLIENTE' } },
  }), 1)
  const perfilVinculado = await expect(admin.send('/api/admin/clientes/' + vencedor), 200, 'fidelidade após vínculo')
  assert.equal(perfilVinculado.resumoFidelidade.progressoAtual, 2)
  await expect(client().send('/api/pedidos/' + venda.pedidoId), 404, 'venda vinculada continua privada')
  console.log('OK busca e vínculo posterior: homônimos, telefone, fidelidade, retry, isolamento e invariantes')

  if (process.env.CAIXA_PLAYWRIGHT_MODULE) {
    const { validarBuscaVinculoNavegador } = await import('./caixa-express.browser.mjs')
    await validarBuscaVinculoNavegador({ base, admin, operador, senha, filtro: 'joao ' + suffix,
      cliente: primeiro, venda: vendasPagas[0].numero, observacao })
  }

  const sessionWhere = { adminUserId: operador.id }
  const since = new Date(Date.now() - 15 * 60_000 - 1000)
  await db.caixaSessao.updateMany({ where: sessionWhere, data: { atividadeEm: since } })
  await expect(cookieCaixa.send('/api/caixa/vendas'), 401, 'polling não reativa sessão ociosa')
  await login()
  await db.caixaSessao.updateMany({ where: sessionWhere, data: { expiraEm: new Date(Date.now() - 1000) } })
  await expect(cookieCaixa.send('/api/caixa/catalogo'), 401, 'expiração absoluta')
  await login()
  await db.adminUser.update({ where: { id: operador.id }, data: { role: 'ADMIN' } })
  await expect(cookieCaixa.send('/api/caixa/catalogo'), 401, 'mudança de papel invalida a sessão operacional')
  await db.adminUser.update({ where: { id: operador.id }, data: { role: 'CAIXA' } })
  await expect(admin.send('/api/admin/caixa-contas', 'PATCH', { id: operador.id, ativo: false }), 200, 'desativar pelo MASTER')
  await expect(cookieCaixa.send('/api/caixa/catalogo'), 401, 'revogação imediata')
  assert.equal((await expect(admin.send('/api/caixa/vendas'), 200, 'baixa disponível com MFA após revogação')).vendas.some((row) => row.id === pendentes[0].pedidoId), true)
  if (process.env.CAIXA_RECOVERY_URL) {
    const recovery = new URL(process.env.CAIXA_RECOVERY_URL)
    assert.equal(recovery.hostname, '127.0.0.1', 'A instância de recuperação usa loopback.')
    async function recovered(path, method = 'GET', payload) {
      const response = await fetch(new URL(path, recovery), {
        method, headers: { origin: recovery.origin, cookie: admin.cookie(), 'Content-Type': 'application/json' },
        ...(payload !== undefined && { body: JSON.stringify(payload) }),
      })
      return { status: response.status, data: await response.json() }
    }
    const catalog = await expect(recovered('/api/caixa/catalogo'), 200, 'catálogo em recuperação')
    assert.equal(catalog.novasVendas, false)
    const replayRecovery = await expect(recovered('/api/caixa/vendas', 'POST', duplicado), 200, 'retry durante recuperação')
    assert.equal(replayRecovery.pedidoId, venda.pedidoId)
    await expect(recovered('/api/caixa/vendas', 'POST', payload()), 403, 'nova venda bloqueada em recuperação')
    await expect(recovered('/api/caixa/movimentos', 'POST', {
      operacao: 'BAIXA', pedidoId: pendentes[0].pedidoId, meio: 'DINHEIRO', tentativa: randomUUID(),
    }), 200, 'baixa com MFA durante recuperação')
    console.log('OK recuperação compatível: flag desligada, retry, revogação e baixa com MFA')
  }
  console.log('OK fidelidade, última unidade concorrente, temas por tenant, ociosidade, turno e revogação')
} finally {
  const scopedSales = { OR: [{ id: { in: [...saleIds, ...legacySaleIds] } }, { origem: 'CAIXA_EXPRESS', itens: { some: { produtoId: { in: productIds } } } }] }
  const sales = (await db.pedido.findMany({ where: scopedSales, select: { id: true } })).map((pedido) => pedido.id)
  const checkoutBuyers = await db.cliente.findMany({ where: { tenantId: { in: createdTenantIds }, nome: 'Cliente fixture checkout' }, select: { id: true } })
  buyerIds.push(...checkoutBuyers.map((buyer) => buyer.id))
  await db.caixaEvento.deleteMany({ where: { pedidoId: { in: sales } } })
  await db.logOperacao.deleteMany({ where: { OR: [{ produtoId: { in: productIds } }, { pedidoId: { in: sales } }] } })
  await db.itemPedido.deleteMany({ where: { pedidoId: { in: sales } } })
  await db.pedido.deleteMany({ where: { id: { in: sales } } })
  await db.producaoRegistro.deleteMany({ where: { produtoId: { in: productIds } } })
  await db.produtoEstoque.deleteMany({ where: { produtoId: { in: productIds } } })
  await db.produto.deleteMany({ where: { id: { in: productIds } } })
  await db.categoria.deleteMany({ where: { id: { in: categoryIds } } })
  await db.cliente.deleteMany({ where: { id: { in: buyerIds } } })
  await db.authAuditLog.deleteMany({ where: { OR: [{ adminUserId: { in: userIds } }, { tenantId: { in: createdTenantIds } },
    { action: 'CAIXA_ACCOUNT_CHANGED', metadata: { path: ['contaId'], equals: userIds[1] ?? 'fixture' } }] } })
  await db.adminUser.deleteMany({ where: { id: { in: userIds } } })
  if (initialTheme) {
    await db.configuracao.update({ where: { tenantId: tenantIds[0] }, data: initialTheme })
  } else if (initialTheme === null) {
    await db.configuracao.deleteMany({ where: { tenantId: tenantIds[0] } })
  }
  await db.configuracao.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
  await db.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  await db.$disconnect()
}
