const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function cleanup() {
  try {
    console.log('\n=== LIMPANDO BANCO ===\n')
    
    // Identificar tenants antigos
    const antigosId = (await prisma.tenant.findMany({
      where: { slug: { in: ['nossa-pimenta', 'doces-brownies'] } }
    })).map(t => t.id)
    
    // Deletar em ordem: AdminUsers → Cupons → ItemPedido → Pedidos → Produtos → Categorias → Configurações → Tenants
    await prisma.adminUser.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.cupom.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.itemPedido.deleteMany({ where: { pedido: { tenantId: { in: antigosId } } } })
    await prisma.pedido.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.produto.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.categoria.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.configuracao.deleteMany({ where: { tenantId: { in: antigosId } } })
    await prisma.tenant.deleteMany({ where: { id: { in: antigosId } } })
    
    console.log('✅ Tenants antigos e dados relacionados deletados')
    
    // Resetar senha do admin
    const newPassword = 'admin123'
    const passwordHash = await bcrypt.hash(newPassword, 10)
    
    const updated = await prisma.adminUser.updateMany({
      where: { username: 'admin' },
      data: { passwordHash }
    })
    console.log('✅ Senha do admin resetada para: admin123')
    
    // Verificar resultado
    const adminUsers = await prisma.adminUser.findMany({
      include: { tenant: true }
    })
    console.log('\n👤 ADMIN USERS:')
    adminUsers.forEach(u => {
      console.log(`   ✓ ${u.tenant.nome} - username: ${u.username}`)
    })
    
    const tenants = await prisma.tenant.findMany()
    console.log('\n📦 TENANTS:')
    tenants.forEach(t => {
      console.log(`   ✓ ${t.nome} (${t.slug})`)
    })
    
    const produtos = await prisma.produto.findMany()
    console.log('\n🍪 PRODUTOS:')
    produtos.forEach(p => {
      console.log(`   ✓ ${p.nome} - R$ ${(p.preco/100).toFixed(2)}`)
    })
    
    console.log('\n=== CREDENCIAIS PARA LOGIN ===')
    console.log('👤 Usuário: admin')
    console.log('🔐 Senha: admin123')
    console.log('🏪 Loja: Brookie Pregiato')
    
  } catch (error) {
    console.error('❌ ERRO:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

cleanup()
