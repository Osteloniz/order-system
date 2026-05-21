const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const CONFIRMATION = 'LIMPAR_LOGS_PRD'
const DEFAULT_OPERATION_RETENTION_DAYS = 90
const DEFAULT_AUTH_RETENTION_DAYS = 180

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

function getNumericArg(name, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`))
  if (!arg) return fallback
  const value = Number(arg.split('=')[1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function subtractDays(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

async function main() {
  loadEnvFile()

  const execute = hasFlag('--execute')
  const operationDays = getNumericArg('--operation-days', Number(process.env.LOG_OPERATION_RETENTION_DAYS || DEFAULT_OPERATION_RETENTION_DAYS))
  const authDays = getNumericArg('--auth-days', Number(process.env.AUTH_AUDIT_RETENTION_DAYS || DEFAULT_AUTH_RETENTION_DAYS))
  const connectionUrl = process.env.DIRECT_URL || process.env.DATABASE_URL

  if (!connectionUrl) {
    throw new Error('DIRECT_URL ou DATABASE_URL nao estao configuradas.')
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  })

  try {
    const operationCutoff = subtractDays(operationDays)
    const authCutoff = subtractDays(authDays)

    const [operationToDelete, authToDelete, operationTotal, authTotal] = await Promise.all([
      prisma.logOperacao.count({ where: { criadoEm: { lt: operationCutoff } } }),
      prisma.authAuditLog.count({ where: { createdAt: { lt: authCutoff } } }),
      prisma.logOperacao.count(),
      prisma.authAuditLog.count(),
    ])

    console.log('[cleanup-logs] Contagem atual:')
    console.table({
      logOperacaoTotal: operationTotal,
      authAuditTotal: authTotal,
      logOperacaoRemover: operationToDelete,
      authAuditRemover: authToDelete,
      corteLogOperacao: operationCutoff.toISOString(),
      corteAuthAudit: authCutoff.toISOString(),
    })

    if (!execute) {
      console.log('\nModo simulacao. Nada foi apagado.')
      console.log(`Para executar: $env:CONFIRM_CLEANUP_LOGS="${CONFIRMATION}"; npm run logs:cleanup -- --execute`)
      console.log('Opcional: use --operation-days=90 e --auth-days=180 para personalizar a retencao.')
      return
    }

    if (process.env.CONFIRM_CLEANUP_LOGS !== CONFIRMATION) {
      throw new Error(`Confirmacao ausente. Defina CONFIRM_CLEANUP_LOGS=${CONFIRMATION}`)
    }

    const [deletedOperation, deletedAuth] = await prisma.$transaction([
      prisma.logOperacao.deleteMany({ where: { criadoEm: { lt: operationCutoff } } }),
      prisma.authAuditLog.deleteMany({ where: { createdAt: { lt: authCutoff } } }),
    ])

    console.log('\n[cleanup-logs] Limpeza concluida:')
    console.table({
      logOperacaoRemovidos: deletedOperation.count,
      authAuditRemovidos: deletedAuth.count,
    })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[cleanup-logs] Erro:', error.message)
  process.exit(1)
})
