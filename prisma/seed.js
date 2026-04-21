const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function ensureConfiguracao(tenantId, nome) {
  const configExists = await prisma.configuracao.findFirst({ where: { tenantId } })
  if (!configExists) {
    await prisma.configuracao.create({
      data: {
        nomeEstabelecimento: nome,
        enderecoRetirada: 'Endereço de Retirada Exemplo, 123 - Centro',
        freteBase: 500,
        freteRaioKm: 3,
        freteKmExcedente: 100,
        estabelecimentoLat: 0,
        estabelecimentoLng: 0,
        tenantId
      }
    })
  }
}

async function main() {
  const rawPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123'
  const passwordHash = await bcrypt.hash(rawPassword, 10)

  const tenantDoces = await prisma.tenant.upsert({
    where: { slug: 'brookie-pregiato' },
    update: { nome: 'Brookie Pregiato' },
    create: { nome: 'Brookie Pregiato', slug: 'brookie-pregiato', isOpen: true }
  })

  await prisma.adminUser.upsert({
    where: { tenantId_username: { tenantId: tenantDoces.id, username: 'admin' } },
    update: { nome: 'Admin' },
    create: {
      tenantId: tenantDoces.id,
      nome: 'Admin',
      username: 'admin',
      passwordHash
    }
  })

  await ensureConfiguracao(tenantDoces.id, 'Brookie Pregiato')

  const categoriasDoces = await prisma.categoria.count({ where: { tenantId: tenantDoces.id } })
  if (categoriasDoces === 0) {
    const categoriaDoces = await prisma.categoria.create({
      data: { nome: 'Doces', ordem: 1, tenantId: tenantDoces.id }
    })

    await prisma.produto.createMany({
      data: [
        {
          nome: 'Brownie Tradicional',
          descricao: 'Brownie de chocolate com cobertura',
          categoriaId: categoriaDoces.id,
          preco: 1500,
          ativo: true,
          imagemUrl: '/BROWNIE.png',
          ordem: 1,
          tenantId: tenantDoces.id
        },
        {
          nome: 'Brookie Pregiato',
          descricao: 'Brookie exclusivo e delicioso',
          categoriaId: categoriaDoces.id,
          preco: 1800,
          ativo: true,
          imagemUrl: '/BROOKIE.png',
          ordem: 2,
          tenantId: tenantDoces.id
        }
      ]
    })
  }

  const cuponsDoces = await prisma.cupom.count({ where: { tenantId: tenantDoces.id } })
  if (cuponsDoces === 0) {
    await prisma.cupom.create({
      data: {
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        valor: 10,
        maxUsos: 100,
        expiraEm: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        ativo: true,
        tenantId: tenantDoces.id
      }
    })
  }
}

main()
  .catch((error) => {
    console.error('[seed] Erro:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
