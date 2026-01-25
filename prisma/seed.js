const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const configExists = await prisma.configuracao.findFirst()
  if (!configExists) {
    await prisma.configuracao.create({
      data: {
        nomeEstabelecimento: 'Nossa Pimenta',
        enderecoRetirada: 'Endereco de Retirada Exemplo, 123 - Centro',
        freteBase: 500,
        freteRaioKm: 3,
        freteKmExcedente: 100,
        estabelecimentoLat: 0,
        estabelecimentoLng: 0
      }
    })
  }

  const categoriasCount = await prisma.categoria.count()
  if (categoriasCount === 0) {
    const categoriaMolhos = await prisma.categoria.create({
      data: { nome: 'Molhos', ordem: 1 }
    })

    await prisma.produto.createMany({
      data: [
        {
          nome: 'Queridinha',
          descricao: 'Molho artesanal, pimenta dedo de moca e especiarias',
          categoriaId: categoriaMolhos.id,
          preco: 1200,
          ativo: true,
          imagens: ['/QUERIDINHA.png'],
          ordem: 1
        },
        {
          nome: 'Queima Guela',
          descricao: 'Molho artesanal, pimenta carolina reaper e especiarias',
          categoriaId: categoriaMolhos.id,
          preco: 1200,
          ativo: true,
          imagens: ['/QUEIMA.png'],
          ordem: 2
        }
      ]
    })
  }

  const cuponsCount = await prisma.cupom.count()
  if (cuponsCount === 0) {
    await prisma.cupom.create({
      data: {
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        valor: 10,
        maxUsos: 100,
        expiraEm: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        ativo: true
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
