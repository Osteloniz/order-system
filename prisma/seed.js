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

  const tenantPimenta = await prisma.tenant.upsert({
    where: { slug: 'nossa-pimenta' },
    update: { nome: 'Nossa Pimenta' },
    create: { nome: 'Nossa Pimenta', slug: 'nossa-pimenta', isOpen: true }
  })

  const tenantDoces = await prisma.tenant.upsert({
    where: { slug: 'doces-brownies' },
    update: { nome: 'Doces & Brownies' },
    create: { nome: 'Doces & Brownies', slug: 'doces-brownies', isOpen: true }
  })

  await prisma.adminUser.upsert({
    where: { tenantId_username: { tenantId: tenantPimenta.id, username: 'admin' } },
    update: { nome: 'Admin' },
    create: {
      tenantId: tenantPimenta.id,
      nome: 'Admin',
      username: 'admin',
      passwordHash
    }
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

  await ensureConfiguracao(tenantPimenta.id, 'Nossa Pimenta')
  await ensureConfiguracao(tenantDoces.id, 'Doces & Brownies')

  const categoriasPimenta = await prisma.categoria.count({ where: { tenantId: tenantPimenta.id } })
  if (categoriasPimenta === 0) {
    const categoriaMolhos = await prisma.categoria.create({
      data: { nome: 'Molhos', ordem: 1, tenantId: tenantPimenta.id }
    })

    await prisma.produto.createMany({
      data: [
        {
          nome: 'Queridinha',
          descricao: 'Molho artesanal, pimenta dedo de moça e especiarias',
          categoriaId: categoriaMolhos.id,
          preco: 1200,
          ativo: true,
          imagens: ['/QUERIDINHA.png'],
          ordem: 1,
          tenantId: tenantPimenta.id
        },
        {
          nome: 'Queima Guela',
          descricao: 'Molho artesanal, pimenta carolina reaper e especiarias',
          categoriaId: categoriaMolhos.id,
          preco: 1200,
          ativo: true,
          imagens: ['/QUEIMA.png'],
          ordem: 2,
          tenantId: tenantPimenta.id
        }
      ]
    })
  }

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
          imagens: ['/BROWNIE.png'],
          ordem: 1,
          tenantId: tenantDoces.id
        }
      ]
    })
  }

  const cuponsPimenta = await prisma.cupom.count({ where: { tenantId: tenantPimenta.id } })
  if (cuponsPimenta === 0) {
    await prisma.cupom.create({
      data: {
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        valor: 10,
        maxUsos: 100,
        expiraEm: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        ativo: true,
        tenantId: tenantPimenta.id
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
