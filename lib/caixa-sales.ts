import 'server-only'
import { createHash } from 'node:crypto'
import { type CaixaEvento, type Pedido, Prisma } from '@prisma/client'
import type { CaixaActor } from '@/lib/caixa-session'
import { agregarItensCaixa, expressSalesEnabled, meioCaixaLabel, type ItemCaixa, type MeioCaixa, type OperacaoCaixa, type VendaCaixa } from '@/lib/caixa-contract'
import { CaixaError } from '@/lib/caixa-error'
import { prisma } from '@/lib/db'
import { numeroPedidoCurto } from '@/lib/operation-log'
import { calcularTaxaCartao } from '@/lib/order-finance'
import { loadShadowCommittedQuantityMapTx } from '@/lib/stock-commitments'
import { isValidPhone } from '@/lib/phone'
import { addAvailableStock, consumeAvailableStock } from '@/lib/stock'
import { lockTenantStock } from '@/lib/stock-lock'

type Tx = Prisma.TransactionClient

export function expressMeio(pagamento: Pedido['pagamento'], tipoCartao: Pedido['tipoCartao']): MeioCaixa {
  return pagamento === 'CARTAO' ? (tipoCartao ?? 'CREDITO') : pagamento
}

function paymentColumns(meio: MeioCaixa) {
  if (meio === 'CREDITO' || meio === 'DEBITO') return { meio: 'CARTAO' as const, tipoCartao: meio }
  return { meio, tipoCartao: null }
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isBrinde(nome: string) {
  return /(?:^|[^\p{L}])(?:brinde|mimo)(?:[^\p{L}]|$)/iu.test(nome)
}

function isCookie(nomeCategoria: string) {
  return /(?:^|[^\p{L}])cookies?(?:[^\p{L}]|$)/iu.test(nomeCategoria)
}

export async function caixaCatalog(tx: Tx, tenantId: string) {
  const [produtos, sombra] = await Promise.all([
    tx.produto.findMany({
      where: { tenantId, ativo: true, descontinuado: false, preco: { gt: 0 } },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, preco: true, categoria: { select: { nome: true } },
        estoqueProdutos: { where: { tenantId }, select: { quantidadeDisponivel: true } } },
    }),
    loadShadowCommittedQuantityMapTx(tx, tenantId),
  ])
  return produtos.filter((produto) => !isBrinde(produto.nome)).map(({ estoqueProdutos, categoria, ...produto }) => ({
    ...produto, categoria: categoria.nome,
    saldo: Math.max(0, (estoqueProdutos[0]?.quantidadeDisponivel ?? 0) - (sombra.get(produto.id) ?? 0)),
  }))
}

async function cotar(tx: Tx, tenantId: string, itens: ItemCaixa[]) {
  const catalogo = new Map((await caixaCatalog(tx, tenantId)).map((produto) => [produto.id, produto]))
  const linhas = itens.map(({ produtoId, quantidade }) => {
    const produto = catalogo.get(produtoId)
    if (!produto || quantidade > produto.saldo || quantidade > 999) {
      throw new CaixaError(409, produto ? `Saldo insuficiente para ${produto.nome}. Disponível: ${produto.saldo}.` : 'Um item saiu do catálogo.', { produtoId })
    }
    return { produtoId, quantidade, precoUnitarioSnapshot: produto.preco, nomeProdutoSnapshot: produto.nome,
      totalItem: produto.preco * quantidade, caixaElegivelFidelidade: isCookie(produto.categoria) }
  })
  const total = linhas.reduce((soma, linha) => soma + linha.totalItem, 0)
  if (total > 2_147_483_647) throw new CaixaError(400, 'Total acima do limite de uma venda.')
  return { linhas, total, cotacao: hash(linhas.map((linha) => [linha.produtoId, linha.quantidade, linha.precoUnitarioSnapshot])) }
}

export async function cotacaoCaixa(tenantId: string, itens: ItemCaixa[]) {
  return prisma.$transaction((tx) => cotar(tx, tenantId, agregarItensCaixa(itens)))
}

function resultado(evento: CaixaEvento) {
  return {
    pedidoId: evento.pedidoId, numero: numeroPedidoCurto(evento.pedidoId),
    operacao: evento.operacao, total: evento.bruto, efetivoEm: evento.efetivoEm,
    meio: evento.meio ? expressMeio(evento.meio, evento.tipoCartao) : null,
  }
}

async function retry(tx: Tx, actor: CaixaActor, operacao: CaixaEvento['operacao'], tentativa: string, intencaoHash: string) {
  const evento = await tx.caixaEvento.findUnique({
    where: { tenantId_operacao_tentativa: { tenantId: actor.tenantId, operacao, tentativa } },
  })
  if (!evento) return null
  if (evento.intencaoHash !== intencaoHash) throw new CaixaError(409, 'Esta tentativa já foi usada para outra operação.')
  return resultado(evento)
}

export async function concluirVendaCaixa(actor: CaixaActor, input: VendaCaixa) {
  const { tenantId, id: atorId } = actor
  const itens = agregarItensCaixa(input.itens)
  const { clienteId, pago, meio, tentativa, cotacao } = input
  const intencaoHash = hash([clienteId, itens, cotacao, pago, meio])
  return prisma.$transaction(async (tx) => {
    await lockTenantStock(tx, tenantId)
    const existente = await retry(tx, actor, 'VENDA', tentativa, intencaoHash)
    if (existente) return existente
    if (!expressSalesEnabled()) throw new CaixaError(403, 'Novas vendas estão desativadas.')

    await tx.$queryRaw`
      SELECT "id" FROM "Produto"
      WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(itens.map((item) => item.produtoId))})
      ORDER BY "id" FOR SHARE
    `
    const calculado = await cotar(tx, tenantId, itens)
    if (calculado.cotacao !== cotacao) {
      throw new CaixaError(409, 'O preço mudou. Confira a nova cotação antes de confirmar.', {
        novaCotacao: calculado,
      })
    }

    const cliente = clienteId ? await tx.cliente.findFirst({
      where: { tenantId, id: clienteId }, select: { id: true, nome: true, telefone: true },
    }) : null
    if ((clienteId && !cliente) || (!pago && (!cliente?.nome.trim() || !isValidPhone(cliente.telefone)))) {
      throw new CaixaError(422, 'Selecione um cliente com nome e telefone válido para a venda pendente.')
    }

    const config = await tx.configuracao.findUnique({ where: { tenantId }, select: { enderecoRetirada: true } })
    const now = new Date()
    const pagamento = paymentColumns(meio)
    const pedido = await tx.pedido.create({
      data: {
        tenantId, origem: 'CAIXA_EXPRESS', tipoEntrega: 'RETIRADA', status: 'ENTREGUE',
        criadoEm: now, entregueEm: now, estoqueBaixadoEm: now,
        clienteId: cliente?.id, clienteNome: cliente?.nome ?? 'Cliente balcão',
        clienteTelefone: cliente?.telefone, pagamento: pagamento.meio, tipoCartao: pagamento.tipoCartao,
        caixaPagamentoPrevisto: pagamento.meio, caixaTipoCartaoPrevisto: pagamento.tipoCartao,
        statusPagamento: pago ? 'APROVADO' : 'PENDENTE', enderecoRetirada: config?.enderecoRetirada ?? '',
        frete: 0, subtotal: calculado.total, total: calculado.total, itens: { create: calculado.linhas },
      },
    })
    const pedidoNumero = numeroPedidoCurto(pedido.id)
    for (const linha of calculado.linhas) {
      await consumeAvailableStock(tx, tenantId, linha.produtoId, linha.quantidade, linha.nomeProdutoSnapshot, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA', descricao: 'Baixa por venda no Caixa Express.',
        pedidoId: pedido.id, pedidoNumero, metadata: { atorId, origem: 'CAIXA_EXPRESS' },
      })
    }

    const evento = await tx.caixaEvento.create({
      data: {
        tenantId, pedidoId: pedido.id, operacao: 'VENDA', tentativa, intencaoHash, atorId,
        efetivoEm: pago ? now : null, bruto: pedido.total,
        taxa: pagamento.tipoCartao ? calcularTaxaCartao(pedido.total, pagamento.tipoCartao) : 0,
        ...pagamento, detalhes: { statusPagamento: pedido.statusPagamento },
      },
    })
    if (pago) await tx.pedido.update({ where: { id: pedido.id }, data: { caixaRecebimentoAtualId: evento.id } })
    return resultado(evento)
  })
}

async function reporItens(tx: Tx, pedido: Pedido, actor: CaixaActor, itens: ItemCaixa[]) {
  const [linhas, devolucoes] = await Promise.all([
    tx.itemPedido.findMany({ where: { pedidoId: pedido.id } }),
    tx.caixaEvento.findMany({
      where: { tenantId: actor.tenantId, pedidoId: pedido.id, operacao: 'DEVOLUCAO' }, select: { detalhes: true },
    }),
  ])
  const devolvidos = new Map<string, number>()
  for (const evento of devolucoes) {
    for (const item of evento.detalhes as ItemCaixa[]) {
      devolvidos.set(item.produtoId, (devolvidos.get(item.produtoId) ?? 0) + item.quantidade)
    }
  }
  for (const item of itens) {
    const linha = linhas.find((atual) => atual.produtoId === item.produtoId)
    if (!linha || item.quantidade + (devolvidos.get(item.produtoId) ?? 0) > linha.quantidade) {
      throw new CaixaError(409, 'A reposição excede a baixa original.', { produtoId: item.produtoId })
    }
    await addAvailableStock(tx, actor.tenantId, item.produtoId, item.quantidade, {
      tipo: 'ESTORNO_ESTOQUE', descricao: 'Reposição de devolução do Caixa Express.',
      pedidoId: pedido.id, pedidoNumero: numeroPedidoCurto(pedido.id), nomeProduto: linha.nomeProdutoSnapshot,
      metadata: { atorId: actor.id, origem: 'CAIXA_EXPRESS' },
    })
  }
}

export async function movimentarVendaCaixa(actor: CaixaActor, input: OperacaoCaixa) {
  const { operacao, pedidoId, tentativa } = input
  if (actor.role === 'CAIXA' && operacao !== 'BAIXA') throw new CaixaError(403, 'Operação restrita à administração.')
  const intencao = input.operacao === 'DEVOLUCAO' ? { ...input, itens: agregarItensCaixa(input.itens) } : input
  const intencaoHash = hash(intencao)
  return prisma.$transaction(async (tx) => {
    await lockTenantStock(tx, actor.tenantId)
    const existente = await retry(tx, actor, operacao, tentativa, intencaoHash)
    if (existente) return existente
    const pedido = await tx.pedido.findFirst({ where: { id: pedidoId, tenantId: actor.tenantId, origem: 'CAIXA_EXPRESS' } })
    if (!pedido) throw new CaixaError(404, 'Venda não encontrada.')
    const aberto = pedido.status === 'ENTREGUE' && pedido.statusPagamento === 'PENDENTE'
    const pago = pedido.status === 'ENTREGUE' && pedido.statusPagamento === 'APROVADO'
    const now = new Date()
    const base = { tenantId: actor.tenantId, pedidoId, tentativa, intencaoHash, atorId: actor.id, operacao }
    let dados: Prisma.CaixaEventoUncheckedCreateInput = base
    let update: Prisma.PedidoUncheckedUpdateInput | undefined

    switch (intencao.operacao) {
      case 'BAIXA': {
        if (!aberto) {
          const meioConfirmado = pago ? expressMeio(pedido.pagamento, pedido.tipoCartao) : null
          throw new CaixaError(409, meioConfirmado
            ? `Recebimento já confirmado por ${meioCaixaLabel[meioConfirmado]}.`
            : 'Esta venda não tem recebível aberto.', { meioConfirmado })
        }
        const pagamento = paymentColumns(intencao.meio)
        dados = { ...base, ...pagamento, bruto: pedido.total, efetivoEm: now,
          taxa: pagamento.tipoCartao ? calcularTaxaCartao(pedido.total, pagamento.tipoCartao) : 0,
          detalhes: { meioPrevisto: pedido.caixaPagamentoPrevisto, tipoCartaoPrevisto: pedido.caixaTipoCartaoPrevisto } }
        update = { statusPagamento: 'APROVADO', pagamento: pagamento.meio, tipoCartao: pagamento.tipoCartao }
        break
      }
      case 'CORRECAO':
      case 'ESTORNO': {
        if (!pago || !pedido.caixaRecebimentoAtualId || pedido.caixaRecebimentoAtualId !== intencao.versao) {
          throw new CaixaError(409, 'A venda mudou. Atualize a consulta antes de confirmar.')
        }
        const anterior = await tx.caixaEvento.findUniqueOrThrow({ where: { id: pedido.caixaRecebimentoAtualId } })
        dados = { ...base, bruto: pedido.total, motivo: intencao.motivo, recebimentoId: anterior.recebimentoId ?? anterior.id }
        if (intencao.operacao === 'CORRECAO') {
          const pagamento = paymentColumns(intencao.meio)
          const taxa = intencao.taxa ?? (pagamento.tipoCartao ? calcularTaxaCartao(pedido.total, pagamento.tipoCartao) : 0)
          if (taxa > pedido.total || (!pagamento.tipoCartao && taxa > 0)) throw new CaixaError(422, 'Taxa inválida para o meio informado.')
          dados = { ...dados, ...pagamento, taxa, efetivoEm: anterior.efetivoEm,
            detalhes: { anteriorId: anterior.id, meio: anterior.meio, tipoCartao: anterior.tipoCartao, taxa: anterior.taxa } }
          update = { pagamento: pagamento.meio, tipoCartao: pagamento.tipoCartao }
        } else {
          if (intencao.reabrir) {
            const cliente = pedido.clienteId ? await tx.cliente.findFirst({
              where: { id: pedido.clienteId, tenantId: actor.tenantId }, select: { nome: true, telefone: true },
            }) : null
            if (!cliente?.nome.trim() || !isValidPhone(cliente.telefone)) throw new CaixaError(422, 'Para reabrir a dívida, a venda precisa ter cliente com telefone válido.')
          }
          dados = { ...dados, efetivoEm: now, meio: anterior.meio, tipoCartao: anterior.tipoCartao, taxa: 0,
            detalhes: { reabrir: intencao.reabrir, recebimentoAnteriorId: anterior.id } }
          update = { statusPagamento: intencao.reabrir ? 'PENDENTE' : 'REEMBOLSADO',
            status: intencao.reabrir ? 'ENTREGUE' : 'CANCELADO', caixaRecebimentoAtualId: null,
            pagamento: pedido.caixaPagamentoPrevisto ?? pedido.pagamento, tipoCartao: pedido.caixaTipoCartaoPrevisto }
        }
        break
      }
      case 'CANCELAMENTO':
        if (!aberto) throw new CaixaError(409, 'Esta venda não tem recebível aberto.')
        dados = { ...base, motivo: intencao.motivo }
        update = { status: 'CANCELADO', statusPagamento: 'CANCELADO', motivoCancelamento: intencao.motivo }
        break
      case 'DEVOLUCAO':
        await reporItens(tx, pedido, actor, intencao.itens)
        dados = { ...base, motivo: intencao.motivo, detalhes: intencao.itens }
        break
    }

    const evento = await tx.caixaEvento.create({ data: dados })
    if (update) {
      if (operacao === 'BAIXA' || operacao === 'CORRECAO') update.caixaRecebimentoAtualId = evento.id
      await tx.pedido.update({ where: { id: pedidoId }, data: update })
    }
    return resultado(evento)
  })
}
