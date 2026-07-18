import { Prisma } from '@prisma/client'
import { calcularSubtotal, calcularTotal, calcularTotalItem } from '@/lib/calc'
import { inferHostedCheckoutGateway } from '@/lib/hosted-payment'
import { shouldReserveCommonOrderStock } from '@/lib/order-stock'
import { isStatusPedidoReservadoEncomenda } from '@/lib/order-status'
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

function parseDateOnlyOrDateTime(value: string) {
  const normalized = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00-03:00`)
  }
  return new Date(normalized)
}

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
  criadoEm: Date
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
  tipoCartao: PedidoAdminPayload['tipoCartao'] | null
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
      where: { id: item.produtoId, descontinuado: false, tenantId },
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
  const criadoEm = payload.criadoEm ? new Date(payload.criadoEm) : new Date()
  const statusPagamento = payload.statusPagamento ?? (payload.pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE')
  const tipoCartao = payload.pagamento === 'CARTAO' ? (payload.tipoCartao ?? 'CREDITO') : null
  const encomendaPara = payload.tipoEntrega === 'ENCOMENDA' && payload.encomendaPara
    ? parseDateOnlyOrDateTime(payload.encomendaPara)
    : null
  const levadoEm = payload.levadoEm ? new Date(payload.levadoEm) : null
  const separacaoResponsavel = payload.separacaoResponsavel?.length ? payload.separacaoResponsavel : null
  const destinatariosPedido = separacaoResponsavel?.length
    ? separacaoResponsavel.map((pessoa) => pessoa.nome.trim()).filter(Boolean).join(', ')
    : payload.destinatariosPedido?.trim() || null

  return {
    ...cliente,
    criadoEm,
    observacoesPedido: payload.observacoesPedido?.trim() || null,
    responsavelPedido: payload.responsavelPedido?.trim() || null,
    destinatariosPedido,
    separacaoResponsavel,
    levadoEm,
    pagamento: payload.pagamento,
    tipoCartao,
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

function hasPedidoItensChanged(atual: PedidoComItens['itens'], proximo: PedidoCalculado['itens']) {
  if (atual.length !== proximo.length) return true

  const atualOrdenado = [...atual].sort((a, b) => a.produtoId.localeCompare(b.produtoId) || a.id.localeCompare(b.id))
  const proximoOrdenado = [...proximo].sort((a, b) => a.produtoId.localeCompare(b.produtoId) || a.nomeProdutoSnapshot.localeCompare(b.nomeProdutoSnapshot))

  return atualOrdenado.some((itemAtual, index) => {
    const itemProximo = proximoOrdenado[index]
    if (!itemProximo) return true

    return (
      itemAtual.produtoId !== itemProximo.produtoId ||
      itemAtual.quantidade !== itemProximo.quantidade ||
      itemAtual.precoUnitarioSnapshot !== itemProximo.precoUnitarioSnapshot ||
      itemAtual.totalItem !== itemProximo.totalItem ||
      itemAtual.nomeProdutoSnapshot !== itemProximo.nomeProdutoSnapshot
    )
  })
}

function shouldResetHostedCheckoutAfterEdit(pedidoAtual: PedidoComItens, calculado: PedidoCalculado) {
  const pagamentoAtual = pedidoAtual.pagamento
  const pagamentoProximo = calculado.pagamento

  if (pagamentoAtual === 'DINHEIRO' && pagamentoProximo === 'DINHEIRO') return false
  if (pedidoAtual.statusPagamento === 'APROVADO') return false

  if (pagamentoAtual !== pagamentoProximo) return true
  if ((pedidoAtual.tipoCartao ?? null) !== (calculado.tipoCartao ?? null)) return true
  if ((pedidoAtual.clienteNome || '').trim() !== calculado.clienteNome.trim()) return true
  if ((pedidoAtual.clienteTelefone ?? '') !== (calculado.clienteTelefone ?? '')) return true
  if ((pedidoAtual.clienteWhatsapp ?? '') !== (calculado.clienteWhatsapp ?? '')) return true
  if (pedidoAtual.frete !== calculado.frete) return true
  if (pedidoAtual.subtotal !== calculado.subtotal) return true
  if (pedidoAtual.total !== calculado.total) return true
  if ((pedidoAtual.descontoValor ?? 0) !== calculado.descontoValor) return true
  if (hasPedidoItensChanged(pedidoAtual.itens, calculado.itens)) return true

  return false
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

  if (isStatusPedidoReservadoEncomenda(atual.status)) {
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
  const hostedCheckoutNeedsReset = shouldResetHostedCheckoutAfterEdit(pedidoAtual, calculado)
  const currentHostedGateway = inferHostedCheckoutGateway(pedidoAtual.asaasCheckoutUrl)
  const shouldBlockMercadoPagoEdit =
    currentHostedGateway === 'MERCADO_PAGO' &&
    Boolean(pedidoAtual.asaasCheckoutUrl?.trim()) &&
    pedidoAtual.statusPagamento === 'PENDENTE' &&
    hostedCheckoutNeedsReset
  const shouldClearHostedPaymentState =
    calculado.pagamento === 'DINHEIRO' ||
    (hostedCheckoutNeedsReset && currentHostedGateway !== 'MERCADO_PAGO')

  if (pedidoAtual.status === 'CANCELADO' || pedidoAtual.status === 'ENTREGUE' || pedidoAtual.status === 'PRONTO_ENTREGA') {
    throw new Error('Somente pedidos em aberto podem ser editados')
  }

  if (shouldBlockMercadoPagoEdit) {
    throw new Error('Esse pedido ja tem um link ativo do Mercado Pago. Para evitar divergencia de cobranca, finalize ou troque o pagamento atual antes de editar valor, itens ou contato.')
  }

  await ajustarUsoCupom(tx, pedidoAtual.cupomId, calculado.cupomId)

  if (pedidoAtual.tipoEntrega === 'ENCOMENDA') {
    await sincronizarEstoqueEncomenda(tx, tenantId, pedidoAtual, calculado, actorNome)
  } else {
    await sincronizarEstoquePedidoComum(tx, tenantId, pedidoAtual, calculado, actorNome)
    const precisaManterReservaComum = shouldReserveCommonOrderStock(pedidoAtual)

    const precisaCriarReservaLegada = (
      !pedidoAtual.estoqueBaixadoEm &&
      !pedidoAtual.estoqueReservadoEm &&
      precisaManterReservaComum
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
      criadoEm: calculado.criadoEm,
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
      tipoCartao: calculado.tipoCartao,
      tipoEntrega: calculado.tipoEntrega,
      encomendaPara: calculado.encomendaPara,
      asaasReturnTokenHash: shouldClearHostedPaymentState ? null : pedidoAtual.asaasReturnTokenHash,
      asaasCheckoutId: shouldClearHostedPaymentState ? null : pedidoAtual.asaasCheckoutId,
      asaasCheckoutUrl: shouldClearHostedPaymentState ? null : pedidoAtual.asaasCheckoutUrl,
      asaasCheckoutExpiresAt: shouldClearHostedPaymentState ? null : pedidoAtual.asaasCheckoutExpiresAt,
      asaasPaymentId: shouldClearHostedPaymentState ? null : pedidoAtual.asaasPaymentId,
      asaasInvoiceUrl: shouldClearHostedPaymentState ? null : pedidoAtual.asaasInvoiceUrl,
      asaasPixQrCode: shouldClearHostedPaymentState ? null : pedidoAtual.asaasPixQrCode,
      asaasPixCopyPaste: shouldClearHostedPaymentState ? null : pedidoAtual.asaasPixCopyPaste,
      asaasPaymentStatus: shouldClearHostedPaymentState ? null : pedidoAtual.asaasPaymentStatus,
      asaasLastEventId: shouldClearHostedPaymentState ? null : pedidoAtual.asaasLastEventId,
      asaasLastSyncAt: shouldClearHostedPaymentState ? null : pedidoAtual.asaasLastSyncAt,
      enderecoEntrega: null,
      enderecoRetirada: configuracao?.enderecoRetirada ?? '',
      subtotal: calculado.subtotal,
      frete: calculado.frete,
      total: calculado.total,
      statusPagamento: calculado.statusPagamento,
      descontoValor: calculado.descontoValor > 0 ? calculado.descontoValor : null,
      cupomCodigoSnapshot: calculado.cupomCodigoSnapshot,
      cupomId: calculado.cupomId,
      estoqueReservadoEm: pedidoAtual.tipoEntrega !== 'ENCOMENDA' && !pedidoAtual.estoqueBaixadoEm && shouldReserveCommonOrderStock(pedidoAtual)
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

  if (isStatusPedidoReservadoEncomenda(atual.status)) {
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
