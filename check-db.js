const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkDb() {
  try {
    console.log('\n=== VERIFICANDO BANCO DE DADOS ===\n')
    
    // Verificar tenants
    const tenants = await prisma.tenant.findMany()
    console.log('📦 TENANTS:', tenants)
    
    // Verificar admin users
    const adminUsers = await prisma.adminUser.findMany({
      include: { tenant: true }
    })
    console.log('\n👤 ADMIN USERS:', adminUsers)
    
    // Verificar categorias
    const categorias = await prisma.categoria.findMany({
      include: { produtos: true }
    })
    console.log('\n📚 CATEGORIAS:', categorias.length)
    
    // Verificar produtos
    const produtos = await prisma.produto.findMany()
    console.log('🍪 PRODUTOS:', produtos)
    
  } catch (error) {
    console.error('❌ ERRO:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkDb()
