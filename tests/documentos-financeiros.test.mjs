import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import test from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const { normalizarCnpj, normalizarNomeFinanceiro, validarArquivoFinanceiro, LIMITE_DOCUMENTO_BYTES } =
  await import('../lib/documento-financeiro-arquivo.ts')

const chave = '35261112345678000195550010000012341000012345'
const nota = (key = chave) => Buffer.from(
  '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe' + key + '">' +
  '<ide><nNF>1234</nNF><serie>001</serie><dhEmi>2026-11-23T10:00:00-03:00</dhEmi></ide>' +
  '<emit><CNPJ>12345678000195</CNPJ><xNome>Comércio Fictício Ltda</xNome></emit>' +
  '<det nItem="1"><prod><xProd>Item sintético</xProd><qCom>2.0000</qCom><vProd>31.25</vProd></prod></det>' +
  '<total><ICMSTot><vNF>31.25</vNF></ICMSTot></total></infNFe></NFe></nfeProc>',
)

test('normaliza CNPJ e nome e extrai os valores do emissor XML em centavos', () => {
  assert.equal(normalizarCnpj('12.345.678/0001-95'), '12345678000195')
  assert.equal(normalizarCnpj('12.345.678/0001-94'), null)
  assert.equal(normalizarCnpj('00.000.000/0000-00'), null)
  assert.equal(normalizarNomeFinanceiro(' Comércio Fictício, S/A '), 'comercio ficticio')
  const { xml, mimeType, sha256 } = validarArquivoFinanceiro('nota.xml', 'text/xml', nota())
  assert.equal(mimeType, 'application/xml')
  assert.match(sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(xml.campos, {
    emissor: 'Comércio Fictício Ltda', cnpj: '12345678000195', chave, numero: '1234', serie: '1',
    emissao: '2026-11-23', vencimento: undefined, valor: 3125, descricao: 'NF-e 1234',
    itens: [{ descricao: 'Item sintético', quantidade: '2.0000', valor: 3125 }],
  })
  assert.equal(xml.confianca.valor, 'ALTA')
  assert.equal(xml.confianca.descricao, 'BAIXA')
})

test('rejeita formato adulterado, limite excedido, XML malformado, DTD e SVG', () => {
  for (const [nome, mime, dados, status] of [
    ['nota.pdf', 'application/pdf', nota(), 415],
    ['nota.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n<html/>'), 415],
    ['nota.xml', 'image/jpeg', nota(), 415],
    ['nota.xml', 'application/xml', Buffer.from('<NFe>'), 415],
    ['nota.xml', 'application/xml', Buffer.concat([Buffer.from('<!DOCTYPE nfeProc>'), nota()]), 415],
    ['nota.xml', 'application/xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 415],
    ['nota.pdf', 'application/pdf', Buffer.alloc(LIMITE_DOCUMENTO_BYTES + 1), 413],
  ]) {
    assert.throws(() => validarArquivoFinanceiro(nome, mime, dados), { status })
  }
})

const urlTeste = process.env.DOCUMENTOS_TEST_DATABASE_URL
test('OAuth pessoal com PKCE, vínculo à sessão, uso único, renovação e desconexão', { skip: !urlTeste }, async (t) => {
  const url = new URL(urlTeste)
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/brookie_documentos_test')
  process.env.DATABASE_URL = urlTeste
  const { prisma } = await import('../lib/db.ts')
  const {
    arquivosOneDrive, concluirOneDrive, desconectarOneDrive, estadoOneDrive,
    exigirOneDrive, guardarRetornoOneDrive, iniciarOneDrive,
  } = await import('../lib/onedrive-financeiro.ts')
  const env = {
    ONEDRIVE_CLIENT_ID: randomUUID(),
    ONEDRIVE_CLIENT_SECRET: 'credencial-ficticia',
    ONEDRIVE_REDIRECT_URI: 'http://localhost:3000/api/admin/integracoes/onedrive/callback',
    ONEDRIVE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'develop',
  }
  const original = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]))
  Object.assign(process.env, env)
  const ator = { tenantId: randomUUID(), adminUserId: randomUUID(), sessaoId: randomUUID() }
  const acessos = []
  let challenge
  let refreshValido = true
  const documento = Buffer.from('original fictício')
  const pasta = { id: 'pasta', folder: {}, parentReference: { driveId: 'drive' } }
  const pathArq = '/v1.0/drives/drive/items/pasta:/nota.pdf'
  t.mock.method(globalThis, 'fetch', async (destino, init) => {
    const target = new URL(destino)
    const auth = new Headers(init.headers).get('authorization')
    acessos.push([target.hostname, target.pathname, init.method, auth])
    if (target.hostname === 'login.microsoftonline.com') {
      assert.match(target.pathname, /^\/consumers\//)
      if (init.body.get('grant_type') === 'refresh_token' && !refreshValido) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      }
      const renovando = init.body.get('grant_type') === 'refresh_token'
      if (renovando) assert.match(init.body.get('refresh_token'), /^refresh-ficticio/)
      else assert.equal(createHash('sha256').update(init.body.get('code_verifier')).digest('base64url'), challenge)
      return Response.json({
        access_token: renovando ? 'access-ficticio-renovado' : 'access-ficticio',
        refresh_token: renovando ? 'refresh-ficticio-renovado' : 'refresh-ficticio',
        expires_in: 3600, token_type: 'Bearer',
      })
    }
    if (target.pathname.endsWith('/special/approot')) return Response.json(pasta)
    if (target.pathname === pathArq + ':/content') {
      assert.equal(new Headers(init.headers).get('if-none-match'), '*')
      assert.deepEqual(Buffer.from(init.body), documento)
      return Response.json({ id: 'arquivo', file: {}, parentReference: { driveId: 'drive' } }, { status: 201 })
    }
    if (target.pathname === '/v1.0/drives/drive/items/arquivo/content') {
      return new Response(null, { status: 302, headers: { location: 'https://exemplo.files.1drv.com/original' } })
    }
    if (target.hostname === 'exemplo.files.1drv.com') {
      assert.equal(auth, null)
      return new Response(documento)
    }
    return Response.json({}, { status: 404 })
  })
  try {
    await prisma.tenant.create({ data: { id: ator.tenantId, slug: ator.tenantId, nome: 'OAuth teste' } })
    const config = exigirOneDrive()
    const inicio = await iniciarOneDrive(ator, config)
    const authorization = new URL(inicio.url)
    challenge = authorization.searchParams.get('code_challenge')
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(authorization.searchParams.get('state'), inicio.state)
    assert.equal(authorization.searchParams.get('client_secret'), null)
    assert.equal(await guardarRetornoOneDrive(config, inicio.state, 'codigo-teste'), true)
    assert.equal(await guardarRetornoOneDrive(config, inicio.state, 'codigo-teste'), false)
    await assert.rejects(concluirOneDrive({ ...ator, sessaoId: randomUUID() }, config, inicio.state), { status: 409 })
    await concluirOneDrive(ator, config, inicio.state)
    await assert.rejects(concluirOneDrive(ator, config, inicio.state), { status: 409 })
    assert.equal(await estadoOneDrive(ator.tenantId), 'CONECTADO')
    const salvo = await prisma.oneDriveFinanceiro.findUniqueOrThrow({ where: { tenantId: ator.tenantId } })
    assert.equal(JSON.stringify(salvo).includes('refresh-ficticio'), false)
    const arquivos = arquivosOneDrive(ator)
    const ref = await arquivos.salvar({
      tenantId: ator.tenantId, caminho: 'nota.pdf', mimeType: 'application/pdf', bytes: documento,
      sha256: createHash('sha256').update(documento).digest('hex'),
    })
    await prisma.oneDriveFinanceiro.update({ where: { tenantId: ator.tenantId }, data: { acessoExpiraEm: new Date(0) } })
    assert.deepEqual(Buffer.from(await new Response(await arquivos.abrir(ator.tenantId, ref)).arrayBuffer()), documento)
    assert.ok(acessos.some(([, rota, , auth]) => rota.endsWith('/content') && auth === 'Bearer access-ficticio-renovado'))
    refreshValido = false
    await prisma.oneDriveFinanceiro.update({ where: { tenantId: ator.tenantId }, data: { acessoExpiraEm: new Date(0) } })
    await assert.rejects(arquivos.abrir(ator.tenantId, ref), { status: 409 })
    assert.equal(await estadoOneDrive(ator.tenantId), 'DESCONECTADO')
    const reconectar = await iniciarOneDrive(ator, config)
    await desconectarOneDrive(ator)
    assert.equal(await guardarRetornoOneDrive(config, reconectar.state, 'codigo-teste'), false)
    assert.equal(await prisma.oneDriveEvento.count({ where: { tenantId: ator.tenantId, acao: 'RENOVACAO_INVALIDA' } }), 1)
  } finally {
    for (const [k, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[k]
      else process.env[k] = value
    }
    await prisma.oneDriveEvento.deleteMany({ where: { tenantId: ator.tenantId } })
    await prisma.oneDriveAutorizacao.deleteMany({ where: { tenantId: ator.tenantId } })
    await prisma.oneDriveFinanceiro.deleteMany({ where: { tenantId: ator.tenantId } })
    await prisma.tenant.deleteMany({ where: { id: ator.tenantId } })
    await prisma.$disconnect()
  }
})

test('isolamento, auditoria, revisão e confirmação concorrente em Postgres local', { skip: !urlTeste }, async () => {
  const url = new URL(urlTeste)
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/brookie_documentos_test')
  process.env.DATABASE_URL = urlTeste
  const { prisma } = await import('../lib/db.ts')
  const {
    abrirDocumento, cancelarDocumento, capturarDocumento, confirmarDocumento, consultarDocumento,
    salvarRevisaoDocumento, salvarRevisaoSchema,
  } = await import('../lib/documentos-financeiros.ts')
  const documentos = new Map()
  const storage = {
    async salvar({ tenantId, caminho, bytes }) {
      assert.match(caminho, new RegExp('^Notas/' + tenantId + '/\\d{4}/\\d{2}/'))
      if (!documentos.has(caminho)) documentos.set(caminho, Buffer.from(bytes))
      return { driveId: tenantId, driveItemId: caminho }
    },
    async abrir(tenantId, { driveId, driveItemId }) {
      assert.equal(tenantId, driveId)
      const original = documentos.get(driveItemId)
      return original ? new ReadableStream({ start(controller) {
        controller.enqueue(original)
        controller.close()
      } }) : null
    },
  }
  const a = { tenantId: randomUUID(), adminUserId: randomUUID() }
  const b = { tenantId: randomUUID(), adminUserId: randomUUID() }
  const captura = (ator, bytes = nota()) => capturarDocumento(
    ator, { id: randomUUID(), nome: 'nota.xml', mime: 'application/xml', bytes }, storage,
  )
  const revisao = (fornecedor = { tipo: 'SEM_FORNECEDOR' }) => salvarRevisaoSchema.parse({
    versao: 0, revisao: { descricao: 'Nota fictícia', valor: 3125, vencimento: '2026-12-01', fornecedor },
  })
  try {
    await prisma.tenant.createMany({
      data: [a, b].map(({ tenantId }) => ({ id: tenantId, slug: tenantId, nome: 'Tenant de teste' })),
    })
    const outro = await prisma.fornecedorFinanceiro.create({
      data: { tenantId: b.tenantId, nome: 'Fornecedor de outro tenant', cnpjNormalizado: '12345678000195' },
    })
    const primeira = await captura(a)
    assert.equal(primeira.status, 'PRONTO_PARA_REVISAO')
    assert.equal(await prisma.contaPagar.count({ where: { tenantId: a.tenantId } }), 0)
    assert.equal(await prisma.fornecedorFinanceiro.count({ where: { tenantId: a.tenantId } }), 0)
    assert.equal((await consultarDocumento(a, primeira.id)).fornecedorPorCnpj, null)
    assert.equal(Object.hasOwn(primeira, 'driveItemId'), false)
    await assert.rejects(consultarDocumento(b, primeira.id), { status: 404 })
    await assert.rejects(abrirDocumento(b, primeira.id, storage), { status: 404 })
    const aberto = await abrirDocumento(a, primeira.id, storage)
    assert.deepEqual(Buffer.from(await new Response(aberto.stream).arrayBuffer()), nota())
    await assert.rejects(confirmarDocumento(a, primeira.id, { versao: 0 }), { status: 400 })
    await salvarRevisaoDocumento(a, primeira.id, revisao({ tipo: 'EXISTENTE', id: outro.id }))
    await assert.rejects(confirmarDocumento(a, primeira.id, { versao: 1 }), { status: 400 })
    const novaRevisao = revisao({ tipo: 'CADASTRAR', nome: 'Comércio Fictício', cnpj: '12.345.678/0001-95' })
    const revisado = await salvarRevisaoDocumento(a, primeira.id, { ...novaRevisao, versao: 1 })
    assert.equal(await prisma.fornecedorFinanceiro.count({ where: { tenantId: a.tenantId } }), 0)
    const respostas = await Promise.all([
      confirmarDocumento(a, primeira.id, { versao: revisado.versao }),
      confirmarDocumento(a, primeira.id, { versao: revisado.versao }),
    ])
    const contaPagarId = respostas[0].contaPagarId
    assert.equal(respostas[1].contaPagarId, contaPagarId)
    assert.equal(respostas.filter((resposta) => resposta.repetido).length, 1)
    const conta = await prisma.contaPagar.findUniqueOrThrow({ where: { id: contaPagarId } })
    assert.equal(conta.status, 'PENDENTE')
    assert.equal(conta.pagoEm, null)
    assert.equal(conta.valor, 3125)
    assert.equal(conta.vencimento.toISOString(), '2026-12-01T03:00:00.000Z')

    const duplicado = await captura(a, Buffer.concat([nota(), Buffer.from('\n')]))
    assert.equal((await consultarDocumento(a, duplicado.id)).fornecedorPorCnpj.id, conta.fornecedorFinanceiroId)
    await salvarRevisaoDocumento(a, duplicado.id, revisao())
    const conflito = await confirmarDocumento(a, duplicado.id, { versao: 1 })
    assert.equal(conflito.duplicidades[0].id, contaPagarId)
    assert.ok(conflito.duplicidades[0].sinais.includes('CHAVE_FISCAL'))
    const vinculado = await confirmarDocumento(a, duplicado.id, {
      versao: 1, duplicidade: { tipo: 'USAR_EXISTENTE', contaPagarId },
    })
    assert.equal(vinculado.contaPagarId, contaPagarId)
    assert.equal(await prisma.contaPagar.count({ where: { tenantId: a.tenantId } }), 1)

    const semChave = await captura(a, nota(''))
    await salvarRevisaoDocumento(a, semChave.id, revisao())
    const alerta = await confirmarDocumento(a, semChave.id, { versao: 1 })
    assert.ok(alerta.duplicidades[0].sinais.includes('CNPJ_NUMERO_SERIE'))
    await confirmarDocumento(a, semChave.id, {
      versao: 1, duplicidade: { tipo: 'MANTER_NOVO', motivo: 'Teste de decisão explícita' },
    })
    assert.equal(await prisma.contaPagar.count({ where: { tenantId: a.tenantId } }), 2)
    assert.equal(await prisma.documentoFinanceiroEvento.count({
      where: { tenantId: a.tenantId, documentoId: semChave.id, acao: 'DUPLICIDADE', motivo: { not: null } },
    }), 1)

    const pdf = await capturarDocumento(a, {
      id: randomUUID(), nome: 'teste.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.7\n%%EOF\n'),
    }, storage, async () => ({ campos: { emissor: 'Nome OCR' }, confianca: { emissor: 'ALTA' } }))
    assert.equal(pdf.origemLeitura, 'OCR')
    assert.deepEqual(pdf.dadosExtraidos, { campos: { emissor: 'Nome OCR' }, confianca: { emissor: 'BAIXA' } })
    await cancelarDocumento(a, pdf.id, { versao: 0, motivo: 'Cancelamento de teste' })
    await assert.rejects(confirmarDocumento(a, pdf.id, { versao: 1 }), { status: 409 })
    assert.equal((await consultarDocumento(a, pdf.id)).status, 'CANCELADO')

    const doisUploads = await Promise.all([captura(b), captura(b)])
    await Promise.all(doisUploads.map(({ id }) => salvarRevisaoDocumento(b, id, revisao())))
    const duasConfirmacoes = await Promise.all(doisUploads.map(({ id }) => confirmarDocumento(b, id, { versao: 1 })))
    assert.equal(duasConfirmacoes.filter((resultado) => resultado.contaPagarId).length, 1)
    assert.equal(duasConfirmacoes.filter((resultado) => resultado.duplicidades?.length).length, 1)
    assert.equal(await prisma.contaPagar.count({ where: { tenantId: b.tenantId } }), 1)
    assert.equal(documentos.size, 6)
  } finally {
    await prisma.documentoFinanceiroEvento.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await prisma.documentoFinanceiro.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await prisma.contaPagar.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await prisma.fornecedorFinanceiro.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await prisma.tenant.deleteMany({ where: { id: { in: [a.tenantId, b.tenantId] } } })
    await prisma.$disconnect()
  }
})
