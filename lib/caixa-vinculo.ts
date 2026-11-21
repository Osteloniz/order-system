import 'server-only'
import { CaixaError } from '@/lib/caixa-error'
import type { CaixaActor } from '@/lib/caixa-session'
import { prisma } from '@/lib/db'
import { numeroPedidoCurto } from '@/lib/operation-log'
import { lockTenantStock } from '@/lib/stock-lock'

export async function vincularClienteVendaCaixa(actor: CaixaActor, pedidoId: string, clienteId: string) {
  if (actor.role === 'CAIXA') throw new CaixaError(403, 'Operação restrita à administração.')

  return prisma.$transaction(async (tx) => {
    await lockTenantStock(tx, actor.tenantId)
    const pedido = await tx.pedido.findFirst({
      where: { id: pedidoId, tenantId: actor.tenantId, origem: 'CAIXA_EXPRESS' },
      select: { clienteId: true, status: true, statusPagamento: true },
    })
    if (!pedido) throw new CaixaError(404, 'Venda não encontrada.')
    if (pedido.clienteId === clienteId) return { pedidoId, clienteId }
    if (pedido.clienteId || pedido.status !== 'ENTREGUE' || pedido.statusPagamento !== 'APROVADO') {
      throw new CaixaError(409, 'O vínculo está disponível para vendas entregues e pagas sem cliente.')
    }

    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, tenantId: actor.tenantId },
      select: { nome: true, telefone: true },
    })
    if (!cliente) throw new CaixaError(404, 'Cliente não encontrado.')

    await tx.pedido.update({
      where: { id: pedidoId },
      data: { clienteId, clienteNome: cliente.nome, clienteTelefone: cliente.telefone },
    })
    await tx.logOperacao.create({
      data: {
        tenantId: actor.tenantId, tipo: 'PEDIDO_EDITADO', descricao: 'Cliente vinculado após a venda no Caixa Express.',
        pedidoId, pedidoNumero: numeroPedidoCurto(pedidoId),
        metadata: { operacao: 'CAIXA_VINCULO_CLIENTE', atorId: actor.id, clienteId },
      },
    })
    return { pedidoId, clienteId }
  })
}
