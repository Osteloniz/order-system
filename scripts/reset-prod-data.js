const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const CONFIRMATION = 'APAGAR_DADOS_PRD'
const TENANT_SLUG = 'brookie-pregiato'

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const key = match[1]
    let value = match[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

async function getCounts(prisma) {
  return {
    tenants: await prisma.tenant.count(),
    admins: await prisma.adminUser.count(),
    configuracoes: await prisma.configuracao.count(),
    categorias: await prisma.categoria.count(),
    produtos: await prisma.produto.count(),
    cupons: await prisma.cupom.count(),
    pedidos: await prisma.pedido.count(),
    itensPedido: await prisma.itemPedido.count(),
  }
}

async function createBaseline(tx) {
  const password = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
  const passwordHash = await bcrypt.hash(password, 10)

  const tenant = await tx.tenant.create({
    data: {
      nome: 'Brookie Pregiato',
      slug: TENANT_SLUG,
      isOpen: true,
    },
  })

  await tx.adminUser.create({
    data: {
      tenantId: tenant.id,
      nome: 'Admin',
      username: 'admin',
      passwordHash,
    },
  })

  await tx.configuracao.create({
    data: {
      tenantId: tenant.id,
      nomeEstabelecimento: 'Brookie Pregiato',
      enderecoRetirada: 'Endereco de Retirada Exemplo, 123 - Centro',
      freteBase: 500,
      freteRaioKm: 3,
      freteKmExcedente: 100,
      estabelecimentoLat: 0,
      estabelecimentoLng: 0,
    },
  })

  if (hasFlag('--seed-sample-data')) {
    const categoria = await tx.categoria.create({
      data: { tenantId: tenant.id, nome: 'Doces', ordem: 1 },
    })

    await tx.produto.createMany({
      data: [
        {
          tenantId: tenant.id,
          categoriaId: categoria.id,
          nome: 'Brownie Tradicional',
          descricao: 'Brownie de chocolate com cobertura',
          preco: 1500,
          ativo: true,
          imagemUrl: '/BROWNIE.png',
          imagens: ['/BROWNIE.png'],
          ordem: 1,
        },
        {
          tenantId: tenant.id,
          categoriaId: categoria.id,
          nome: 'Brookie Pregiato',
          descricao: 'Brookie exclusivo e delicioso',
          preco: 1800,
          ativo: true,
          imagemUrl: '/BROOKIE.png',
          imagens: ['/BROOKIE.png'],
          ordem: 2,
        },
      ],
    })
  }
}

async function main() {
  loadEnvFile()

  const databaseUrl = process.env.DATABASE_URL || ''
  const execute = hasFlag('--execute')

  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao esta configurada.')
  }

  if (databaseUrl.startsWith('file:')) {
    throw new Error('Este script e para Postgres/Neon, nao SQLite.')
  }

  const prisma = new PrismaClient()

  try {
    const before = await getCounts(prisma)
    console.log('[reset-prod-data] Contagens atuais:')
    console.table(before)

    if (!execute) {
      console.log('\nModo simulacao. Nada foi apagado.')
      console.log(`Para executar: $env:CONFIRM_RESET_DATA="${CONFIRMATION}"; npm run db:reset-prod-data -- --execute`)
      console.log('Opcional: adicione --seed-sample-data para recriar produtos de exemplo.')
      return
    }

    if (process.env.CONFIRM_RESET_DATA !== CONFIRMATION) {
      throw new Error(`Confirmacao ausente. Defina CONFIRM_RESET_DATA=${CONFIRMATION}`)
    }

    await prisma.$transaction(async (tx) => {
      await tx.itemPedido.deleteMany()
      await tx.pedido.deleteMany()
      await tx.produto.deleteMany()
      await tx.categoria.deleteMany()
      await tx.cupom.deleteMany()
      await tx.configuracao.deleteMany()
      await tx.adminUser.deleteMany()
      await tx.tenant.deleteMany()

      await createBaseline(tx)
    })

    const after = await getCounts(prisma)
    console.log('\n[reset-prod-data] Limpeza concluida. Contagens finais:')
    console.table(after)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[reset-prod-data] Erro:', error.message)
  process.exit(1)
})
