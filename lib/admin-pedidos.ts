import { Prisma } from '@prisma/client'
import { calcularSubtotal, calcularTotal, calcularTotalItem } from '@/lib/calc'
import { numeroPedidoCurto, registrarLogOperacao } from '@/lib/operation-log'
import { normalizePhone } from '@/lib/phone'
import type { PedidoAdminPayload, SeparacaoResponsavelPessoa } from '@/lib/types'
import { addAvailableStock, consumeAvailableStock, releaseReservedToAvailableStock, reserveFromAvailableStock } from '@/lib/stock'

type Tx = Prisma.TransactionClient

type PedidoComItens = Prisma.PedidoGetPayload<{
  include: {
    itens: true
  }
}>

export type PedidoItemCalculado = {
  produtoId: string
  nomeProdutoSnapshot: string
  precoUnitarioSnapshot: number
  quantidade: number
  totalItem: number
}

export type PedidoCalculado = {
  clienteId: string | null
  clienteNome: string
  clienteTelefone: string | null
  clienteWhatsapp: string | null
  clienteBloco: string | null
  clienteApartamento: string | null
  observacoesPedido: string | null
  responsavelPedido: string | null
  destinatariosPedido: string | null
  separacaoResponsavel: SeparacaoResponsavelPessoa[] | null
  levadoEm: Date | null
  pagamento: PedidoAdminPayload['pagamento']
  tipoEntrega: PedidoAdminPayload['tipoEntrega']
  encomendaPara: Date | null
  statusPagamento: NonNullable<PedidoAdminPayload['statusPagamento']>
  subtotal: number
  frete: number
  descontoValor: number
  origemDesconto: 'CUPOM' | 'PROMOCIONAL' | null
  total: number
  cupomId: string | null
  cupomCodigoSnapshot: string | null
  itens: PedidoItemCalculado[]
}

export async function buildPedidoItens(tx: Tx, tenantId: string, itens: PedidoAdminPayload['itens']) {
  const itensCalculados: PedidoItemCalculado[] = []

  for (const item of itens) {
    const produto = await tx.produto.findFirst({
      where: { id: item.produtoId, ativo: true, tenantId },
      select: { id: true, nome: true, preco: true },
    })

    if (!produto) {
      throw new Error(`Produto indisponivel: ${item.produtoId}`)
    }

    itensCalculados.push({
      produtoId: produto.id,
      nomeProdutoSnapshot: produto.nome,
      precoUnitarioSnapshot: produto.preco,
      quantidade: item.quantidade,
      totalItem: calcularTotalItem(produto.preco, item.quantidade),
    })
  }

  return itensCalculados
}

async function resolveCupom(tx: Tx, tenantId: string, cupomCodigo?: string, cupomAtualId?: string | null) {
  if (!cupomCodigo?.trim()) {
    return { cupomId: null, cupomCodigoSnapshot: null, tipo: null, valor: 0 }
  }

  const codigo = cupomCodigo.trim().toUpperCase()
  const cupom = await tx.cupom.findFirst({
    where: { tenantId, codigo },
    select: { id: true, codigo: true, ativo: true, expiraEm: true, usos: true, maxUsos: true, tipo: true, valor: true },
  })

  const agora = new Date()
  if (!cupom || !cupom.ativo) {
    throw new Error('Cupom invalido')
  }
  if (cupom.expiraEm <= agora) {
    throw new Error('Cupom expirado')
  }
  if (cupom.usos >= cupom.maxUsos && cupom.id !== cupomAtualId) {
    throw new Error('Cupom esgotado')
  }

  return {
    cupomId: cupom.id,
    cupomCodigoSnapshot: cupom.codigo,
    tipo: cupom.tipo,
    valor: cupom.valor,
  }
}

export async function resolveClientePedido(tx: Tx, tenantId: string, payload: PedidoAdminPayload) {
  const nome = payload.clienteNome.trim()
  const telefone = normalizePhone(payload.clienteTelefone) || null
  const whatsappInformado = normalizePhone(payload.clienteWhatsapp)
  const whatsapp = whatsappInformado || telefone
  const clienteBloco = payload.clienteBloco?.trim() || null
  const clienteApartamento = payload.clienteApartamento?.trim() || null
  const observacoes = payload.clienteObservacoes?.trim() || null

  if (payload.clienteId) {
    const clienteAtual = await tx.cliente.findFirst({
      where: { id: payload.clienteId, tenantId },
      select: { id: true },
    })
    if (!clienteAtual) {
      throw new Error('Cliente nao encontrado')
    }

    const cliente = await tx.cliente.update({
      where: { id: payload.clienteId },
      data: {
        nome,
        telefone,
        whatsapp: whatsapp || null,
        clienteBloco,
        clienteApartamento,
        observacoes,
      },
      select: { id: true },
    })

    return {
      clienteId: cliente.id,
      clienteNome: nome,
      clienteTelefone: telefone,
      clienteWhatsapp: whatsapp || null,
      clienteBloco,
      clienteApartamento,
    }
  }

  if (telefone) {
    const cliente = await tx.cliente.upsert({
      where: { tenantId_telefone: { tenantId, telefone } },
      create: {
        tenantId,
        nome,
        telefone,
        whatsapp: whatsapp || null,
        clienteBloco,
        clienteApartamento,
        observacoes,
      },
      update: {
        nome,
        whatsapp: whatsapp || null,
        clienteBloco,
        clienteApartamento,
        observacoes,
      },
      select: { id: true },
    })

    return {
      clienteId: cliente.id,
      clienteNome: nome,
      clienteTelefone: telefone,
      clienteWhatsapp: whatsapp || null,
      clienteBloco,
      clienteApartamento,
    }
  }

  const cliente = await tx.cliente.create({
    data: {
      tenantId,
      nome,
      telefone: null,
      whatsapp: whatsapp || null,
      clienteBloco,
      clienteApartamento,
      observacoes,
    },
    select: { id: true },
  })

  return {
    clienteId: cliente.id,
    clienteNome: nome,
    clienteTelefone: null,
    clienteWhatsapp: whatsapp || null,
    clienteBloco,
    clienteApartamento,
  }
}

export async function calcularPedidoAdmin(
  tx: Tx,
  tenantId: string,
  payload: PedidoAdminPayload,
  cupomAtualId?: string | null
) {
  const itens = await buildPedidoItens(tx, tenantId, payload.itens)
  const subtotal = calcularSubtotal(itens)
  const frete = 0
  const valorPromocional = Math.max(0, Math.round(payload.valorPromocional ?? 0))
  if (payload.cupomCodigo?.trim() && valorPromocional > 0) {
    throw new Error('Use cupom ou valor promocional, nao os dois ao mesmo tempo')
  }
  const cupom = await resolveCupom(tx, tenantId, payload.cupomCodigo, cupomAtualId)
  let descontoValor = 0
  let origemDesconto: PedidoCalculado['origemDesconto'] = null

  if (cupom.cupomId) {
    if (cupom.tipo === 'PERCENTUAL') {
      descontoValor = Math.round(subtotal * (cupom.valor / 100))
    } else {
      descontoValor = cupom.valor
    }
    descontoValor = Math.min(descontoValor, subtotal)
    origemDesconto = 'CUPOM'
  } else if (valorPromocional > 0) {
    descontoValor = Math.min(valorPromocional, subtotal)
    origemDesconto = 'PROMOCIONAL'
  }

  const cliente = await resolveClientePedido(tx, tenantId, payload)
  const statusPagamento = payload.statusPagamento ?? (payload.pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE')
  const encomendaPara = payload.tipoEntrega === 'ENCOMENDA' && payload.encomendaPara
    ? new Date(payload.encomendaPara)
    : null
  const levadoEm = payload.levadoEm ? new Date(payload.levadoEm) : null
  const separacaoResponsavel = payload.separacaoResponsavel?.length ? payload.separacaoResponsavel : null
  const destinatariosPedido = separacaoResponsavel?.length
    ? separacaoResponsavel.map((pessoa) => pessoa.nome.trim()).filter(Boolean).join(', ')
    : payload.destinatariosPedido?.trim() || null

  return {
    ...cliente,
    observacoesPedido: payload.observacoesPedido?.trim() || null,
    responsavelPedido: payload.responsavelPedido?.trim() || null,
    destinatariosPedido,
    separacaoResponsavel,
    levadoEm,
    pagamento: payload.pagamento,
    tipoEntrega: payload.tipoEntrega,
    encomendaPara,
    statusPagamento,
    subtotal,
    frete,
    descontoValor,
    origemDesconto,
    total: Math.max(0, calcularTotal(subtotal, frete) - descontoValor),
    cupomId: cupom.cupomId,
    cupomCodigoSnapshot: cupom.cupomCodigoSnapshot,
    itens,
  } satisfies PedidoCalculado
}

function agruparQuantidadePorProduto<T extends { produtoId: string; quantidade: number }>(itens: T[]) {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidade)
  }
  return mapa
}

function agruparReservadoPorProduto(itens: PedidoComItens['itens']) {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidadePreparada)
  }
  return mapa
}

async function ajustarUsoCupom(tx: Tx, anterior: string | null, proximo: string | null) {
  if (anterior && anterior !== proximo) {
    await tx.cupom.update({
      where: { id: anterior },
      data: { usos: { decrement: 1 } },
    })
  }

  if (proximo && anterior !== proximo) {
    await tx.cupom.update({
      where: { id: proximo },
      data: { usos: { increment: 1 } },
    })
  }
}

async function sincronizarEstoquePedidoComum(
  tx: Tx,
  tenantId: string,
  atual: PedidoComItens,
  proximo: PedidoCalculado,
  actorNome?: string | null
) {
  if (atual.tipoEntrega === 'ENCOMENDA') {
    return
  }

  const estavaConsumido = Boolean(atual.estoqueBaixadoEm)
  const estavaReservado = !estavaConsumido && Boolean(atual.estoqueReservadoEm)
  if (!estavaConsumido && !estavaReservado) return

  const atualMap = agruparQuantidadePorProduto(atual.itens)
  const novoMap = agruparQuantidadePorProduto(proximo.itens)
  const produtoIds = new Set([...atualMap.keys(), ...novoMap.keys()])

  for (const produtoId of produtoIds) {
    const quantidadeAtual = atualMap.get(produtoId) ?? 0
    const quantidadeNova = novoMap.get(produtoId) ?? 0
    const delta = quantidadeNova - quantidadeAtual
    const nomeProduto = proximo.itens.find((item) => item.produtoId === produtoId)?.nomeProdutoSnapshot
      ?? atual.itens.find((item) => item.produtoId === produtoId)?.nomeProdutoSnapshot
      ?? 'produto'
    const pedidoNumero = numeroPedidoCurto(atual.id) ?? atual.id

    if (delta > 0 && estavaConsumido) {
      await consumeAvailableStock(tx, tenantId, produtoId, delta, nomeProduto, {
        tipo: 'BAIXA_ESTOQUE_ENTREGA',
        descricao: `Ajuste de itens do pedido entregue #${pedidoNumero}.`,
        actorNome,
        pedidoId: atual.id,
        pedidoNumero,
      })
    } else if (delta < 0 && estavaConsumido) {
      await addAvailableStock(tx, tenantId, produtoId, Math.abs(delta), {
        tipo: 'ESTORNO_ESTOQUE',
        descricao: `Estorno de itens removidos do pedido entregue #${pedidoNumero}.`,
        actorNome,
        pedidoId: atual.id,
        pedidoNumero,
        nomeProduto,
      })
    } else if (delta > 0 && estavaReservado) {
      await reserveFromAvailableStock(tx, tenantId, produtoId, delta, nomeProduto, {
        tipo: 'RESERVA_ENCOMENDA',
        descricao: `Ajuste da reserva operacional do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: atual.id,
        pedidoNumero,
        metadata: { origem: 'PEDIDO_COMUM' },
      })
    } else if (delta < 0 && estavaReservado) {
      await releaseReservedToAvailableStock(tx, tenantId, produtoId, Math.abs(delta), {
        tipo: 'LIBERACAO_RESERVA',
        descricao: `Reducao da reserva operacional do pedido #${pedidoNumero}.`,
        actorNome,
        pedidoId: atual.id,
        pedidoNumero,
        nomeProduto,
        metadata: { origem: 'PEDIDO_COMUM' },
      })
    }
  }
}

async function sincronizarEstoqueEncomenda(
  tx: Tx,
  tenantId: string,
  atual: PedidoComItens,
  proximo: PedidoCalculado,
  actorNome?: string | null
) {
  const reservadoAtual = agruparReservadoPorProduto(atual.itens)
  const reservadoDesejado = new Map<string, number>()
  const novoMap = agruparQuantidadePorProduto(proximo.itens)
  const pedidoNumero = numeroPedidoCurto(atual.id) ?? atual.id

  if (atual.status === 'PREPARACAO') {
    for (const [produtoId, quantidade] of novoMap.entries()) {
      reservadoDesejado.set(produtoId, quantidade)
    }
  } else {
    for (const [produtoId, quantidadeReservadaAtual] of reservadoAtual.entries()) {
      reservadoDesejado.set(produtoId, Math.min(quantidadeReservadaAtual, novoMap.get(produtoId) ?? 0))
    }
  }

  for (const [produtoId, quantidadeReservadaAtual] of reservadoAtual.entries()) {
    if (quantidadeReservadaAtual > 0) {
      const nomeProduto = atual.itens.find((item) => item.produtoId === produtoId)?.nomeProdutoSnapshot ?? 'produto'
      await releaseReservedToAvailableStock(tx, tenantId, produtoId, quantidadeReservadaAtual, {
        tipo: 'LIBERACAO_RESERVA',
        descricao: `Recalculo da reserva da encomenda #${pedidoNumero}.`,
        actorNome,
        pedidoId: atual.id,
        pedidoNumero,
        nomeProduto,
      })
    }
  }

  for (const [produtoId, quantidadeReservar] of reservadoDesejado.entries()) {
    if (quantidadeReservar <= 0) continue
    const nomeProduto = proximo.itens.find((item) => item.produtoId === produtoId)?.nomeProdutoSnapshot ?? 'produto'
    await reserveFromAvailableStock(tx, tenantId, produtoId, quantidadeReservar, nomeProduto, {
      tipo: 'RESERVA_ENCOMENDA',
      descricao: `Reserva recalculada da encomenda #${pedidoNumero}.`,
      actorNome,
      pedidoId: atual.id,
      pedidoNumero,
    })
  }
}

export async function atualizarPedidoAdmin(
  tx: Tx,
  tenantId: string,
  pedidoAtual: PedidoComItens,
  payload: PedidoAdminPayload,
  configuracao: { enderecoRetirada: string } | null,
  actorNome?: string | null
) {
  const calculado = await calcularPedidoAdmin(tx, tenantId, payload, pedidoAtual.cupomId)
  const pedidoNumero = numeroPedidoCurto(pedidoAtual.id) ?? pedidoAtual.id

  if (pedidoAtual.status === 'CANCELADO' || pedidoAtual.status === 'ENTREGUE') {
    throw new Error('Somente pedidos em aberto podem ser editados')
  }

  await ajustarUsoCupom(tx, pedidoAtual.cupomId, calculado.cupomId)

  if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
    await sincronizarEstoqueEncomenda(tx, tenantId, pedidoAtual, calculado, actorNome)
  } else {
    await sincronizarEstoquePedidoComum(tx, tenantId, pedidoAtual, calculado, actorNome)

    const precisaCriarReservaLegada = (
      !pedidoAtual.estoqueBaixadoEm &&
      !pedidoAtual.estoqueReservadoEm &&
      (pedidoAtual.status === 'ACEITO' || pedidoAtual.status === 'PREPARACAO')
    )

    if (precisaCriarReservaLegada) {
      for (const item of calculado.itens) {
        await reserveFromAvailableStock(tx, tenantId, item.produtoId, item.quantidade, item.nomeProdutoSnapshot, {
          tipo: 'RESERVA_ENCOMENDA',
          descricao: `Reserva operacional criada para pedido ja aberto #${pedidoNumero}.`,
          actorNome,
          pedidoId: pedidoAtual.id,
          pedidoNumero,
          metadata: { origem: 'PEDIDO_COMUM' },
        })
      }
      pedidoAtual.estoqueReservadoEm = new Date()
    }
  }

  const reservadoDesejadoPorProduto = pedidoAtual.tipoEntrega === 'ENCOMENDA'
    ? calcularReservadoDesejadoPorProduto(pedidoAtual, calculado)
    : new Map<string, number>()
  const preparadoEmAnteriorPorProduto = new Map(
    pedidoAtual.itens
      .filter((item) => item.preparadoEm)
      .map((item) => [item.produtoId, item.preparadoEm])
  )

  await tx.itemPedido.deleteMany({
    where: { pedidoId: pedidoAtual.id },
  })

  const pedidoAtualizado = await tx.pedido.update({
    where: { id: pedidoAtual.id },
    data: {
      clienteId: calculado.clienteId,
      clienteNome: calculado.clienteNome,
      clienteTelefone: calculado.clienteTelefone,
      clienteWhatsapp: calculado.clienteWhatsapp,
      clienteBloco: calculado.clienteBloco,
      clienteApartamento: calculado.clienteApartamento,
      observacoesPedido: calculado.observacoesPedido,
      responsavelPedido: calculado.responsavelPedido,
      destinatariosPedido: calculado.destinatariosPedido,
      separacaoResponsavel: calculado.separacaoResponsavel
        ? calculado.separacaoResponsavel as unknown as Prisma.InputJsonValue
        : Prisma.DbNull,
      levadoEm: calculado.levadoEm,
      pagamento: calculado.pagamento,
      tipoEntrega: calculado.tipoEntrega,
      encomendaPara: calculado.encomendaPara,
      enderecoEntrega: null,
      enderecoRetirada: configuracao?.enderecoRetirada ?? '',
      subtotal: calculado.subtotal,
      frete: calculado.frete,
      total: calculado.total,
      statusPagamento: calculado.statusPagamento,
      descontoValor: calculado.descontoValor > 0 ? calculado.descontoValor : null,
      cupomCodigoSnapshot: calculado.cupomCodigoSnapshot,
      cupomId: calculado.cupomId,
      estoqueReservadoEm: pedidoAtual.tipoEntrega !== 'ENCOMENDA' && !pedidoAtual.estoqueBaixadoEm && (pedidoAtual.status === 'ACEITO' || pedidoAtual.status === 'PREPARACAO')
        ? (pedidoAtual.estoqueReservadoEm ?? new Date())
        : pedidoAtual.estoqueReservadoEm,
      itens: {
        create: calculado.itens.map((item) => ({
          produtoId: item.produtoId,
          nomeProdutoSnapshot: item.nomeProdutoSnapshot,
          precoUnitarioSnapshot: item.precoUnitarioSnapshot,
          quantidade: item.quantidade,
          totalItem: item.totalItem,
          quantidadePreparada: pedidoAtual.tipoEntrega === 'ENCOMENDA'
            ? Math.min(reservadoDesejadoPorProduto.get(item.produtoId) ?? 0, item.quantidade)
            : 0,
          preparadoEm: pedidoAtual.tipoEntrega === 'ENCOMENDA' && (reservadoDesejadoPorProduto.get(item.produtoId) ?? 0) > 0
            ? preparadoEmAnteriorPorProduto.get(item.produtoId) ?? new Date()
            : null,
        })),
      },
    },
    include: { itens: true },
  })

  await registrarLogOperacao(tx, {
    tenantId,
    tipo: 'PEDIDO_EDITADO',
    descricao: `Pedido #${pedidoNumero} editado no painel.`,
    actorNome,
    pedidoId: pedidoAtual.id,
    pedidoNumero,
    quantidade: pedidoAtualizado.itens.reduce((acc, item) => acc + item.quantidade, 0),
    metadata: {
      status: pedidoAtual.status,
      tipoEntrega: pedidoAtualizado.tipoEntrega,
      statusPagamento: pedidoAtualizado.statusPagamento,
    },
  })

  return pedidoAtualizado
}

function calcularReservadoDesejadoPorProduto(atual: PedidoComItens, proximo: PedidoCalculado) {
  const reservadoAtual = agruparReservadoPorProduto(atual.itens)
  const novoMap = agruparQuantidadePorProduto(proximo.itens)
  const reservadoDesejado = new Map<string, number>()

  if (atual.status === 'PREPARACAO') {
    for (const [produtoId, quantidade] of novoMap.entries()) {
      reservadoDesejado.set(produtoId, quantidade)
    }
    return reservadoDesejado
  }

  for (const [produtoId, quantidadeReservadaAtual] of reservadoAtual.entries()) {
    reservadoDesejado.set(produtoId, Math.min(quantidadeReservadaAtual, novoMap.get(produtoId) ?? 0))
  }

  return reservadoDesejado
}
