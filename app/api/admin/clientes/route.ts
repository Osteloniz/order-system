import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

const clienteSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().max(20).optional(),
  whatsapp: z.string().trim().max(20).optional(),
  clienteBloco: z.string().trim().max(20).optional(),
  clienteApartamento: z.string().trim().max(20).optional(),
  observacoes: z.string().trim().max(1000).optional(),
}).strict()

function normalizePhone(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function serializeCliente(cliente: Awaited<ReturnType<typeof prisma.cliente.findFirst>>) {
  return cliente
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const telefone = request.nextUrl.searchParams.get('telefone')
  const search = request.nextUrl.searchParams.get('search')?.trim()
  const take = Math.min(Number(request.nextUrl.searchParams.get('take') || 50), 100)

  if (telefone) {
    const telefoneLimpo = normalizePhone(telefone)
    const cliente = await prisma.cliente.findFirst({
      where: { tenantId: admin.tenantId, telefone: telefoneLimpo },
      include: {
        pedidos: {
          include: { itens: true },
          orderBy: { criadoEm: 'desc' },
          take: 20,
        },
      },
    })
    return NextResponse.json(cliente ?? null)
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      tenantId: admin.tenantId,
      ...(search ? {
        OR: [
          { nome: { contains: search, mode: 'insensitive' as const } },
          { telefone: { contains: normalizePhone(search) || search } },
          { whatsapp: { contains: normalizePhone(search) || search } },
        ],
      } : {}),
    },
    include: {
      pedidos: {
        include: { itens: true },
        orderBy: { criadoEm: 'desc' },
        take: 10,
      },
    },
    orderBy: { atualizadoEm: 'desc' },
    take,
  })

  return NextResponse.json(clientes.map(serializeCliente))
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const parsed = clienteSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })

  const body = parsed.data
  const telefone = normalizePhone(body.telefone)
  const whatsapp = body.whatsapp ? normalizePhone(body.whatsapp) : telefone

  if (telefone && (telefone.length < 10 || telefone.length > 13)) {
    return NextResponse.json({ error: 'Telefone invalido' }, { status: 400 })
  }

  const cliente = telefone
    ? await prisma.cliente.upsert({
      where: { tenantId_telefone: { tenantId: admin.tenantId, telefone } },
      create: {
        tenantId: admin.tenantId,
        nome: body.nome.trim(),
        telefone,
        whatsapp: whatsapp || null,
        clienteBloco: body.clienteBloco?.trim() || null,
        clienteApartamento: body.clienteApartamento?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
      },
      update: {
        nome: body.nome.trim(),
        whatsapp: whatsapp || null,
        clienteBloco: body.clienteBloco?.trim() || null,
        clienteApartamento: body.clienteApartamento?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
      },
      include: {
        pedidos: {
          include: { itens: true },
          orderBy: { criadoEm: 'desc' },
          take: 20,
        },
      },
    })
    : await prisma.cliente.create({
      data: {
        tenantId: admin.tenantId,
        nome: body.nome.trim(),
        telefone: null,
        whatsapp: whatsapp || null,
        clienteBloco: body.clienteBloco?.trim() || null,
        clienteApartamento: body.clienteApartamento?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
      },
      include: {
        pedidos: {
          include: { itens: true },
          orderBy: { criadoEm: 'desc' },
          take: 20,
        },
      },
    })

  return NextResponse.json(cliente, { status: 201 })
}
