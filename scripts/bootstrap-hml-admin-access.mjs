import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const PRIMARY_EMAIL = 'joao.murat30@gmail.com'
const PRIMARY_NAME = 'João'
const SECONDARY_EMAIL = 'lni165091@gmail.com'
const SECONDARY_NAME = 'Nicolly'
const TENANT_SLUG = 'brookie-pregiato'
const LOCAL_APP_URL = 'http://localhost:3000'
const INVITE_HOURS = 24

const prisma = new PrismaClient()
const envPath = resolve(process.cwd(), '.env')
const invitePath = join(homedir(), 'Downloads', 'CONVITE_NICOLLY_BROOKIE_HML.txt')

function setEnvValue(content, key, value) {
  const line = `${key}="${value}"`
  const matcher = new RegExp(`^${key}=.*$`, 'm')
  return matcher.test(content)
    ? content.replace(matcher, line)
    : `${content.trimEnd()}\n${line}\n`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_NOT_CONFIGURED')

  let envContent = readFileSync(envPath, 'utf8')
  const tokenPepper = process.env.TOKEN_PEPPER?.trim() || randomBytes(48).toString('base64')
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY?.trim() || randomBytes(32).toString('base64')
  const allowlist = `${PRIMARY_EMAIL},${SECONDARY_EMAIL}`

  envContent = setEnvValue(envContent, 'TOKEN_PEPPER', tokenPepper)
  envContent = setEnvValue(envContent, 'AUTH_ENCRYPTION_KEY', encryptionKey)
  envContent = setEnvValue(envContent, 'ADMIN_ALLOWED_EMAILS', allowlist)
  writeFileSync(envPath, envContent, { encoding: 'utf8', mode: 0o600 })

  process.env.TOKEN_PEPPER = tokenPepper
  process.env.AUTH_ENCRYPTION_KEY = encryptionKey
  process.env.ADMIN_ALLOWED_EMAILS = allowlist

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
  if (!tenant) throw new Error('BROOKIE_TENANT_NOT_FOUND')

  const users = await prisma.adminUser.findMany({ where: { tenantId: tenant.id } })
  const allowedEmails = new Set([PRIMARY_EMAIL, SECONDARY_EMAIL])
  const unexpectedActiveUsers = users.filter(user => (
    user.ativo && user.emailNormalizado && !allowedEmails.has(user.emailNormalizado)
  ))
  if (unexpectedActiveUsers.length > 0) throw new Error('UNEXPECTED_ACTIVE_ADMIN_FOUND')

  let primary = users.find(user => user.emailNormalizado === PRIMARY_EMAIL)
  if (!primary) {
    const legacyCandidates = users.filter(user => !user.emailNormalizado)
    if (legacyCandidates.length !== 1) throw new Error('LEGACY_ADMIN_NOT_UNIQUE')
    primary = legacyCandidates[0]
  }

  primary = await prisma.adminUser.update({
    where: { id: primary.id },
    data: {
      nome: PRIMARY_NAME,
      email: PRIMARY_EMAIL,
      emailNormalizado: PRIMARY_EMAIL,
      ativo: true,
      sessionVersion: { increment: 1 },
      totpPendingSecretEncrypted: null,
      totpPendingExpiresAt: null,
    },
  })

  const secondary = users.find(user => user.emailNormalizado === SECONDARY_EMAIL)
  let inviteCreated = false
  if (!secondary) {
    await prisma.userInvite.updateMany({
      where: {
        tenantId: tenant.id,
        emailNormalizado: SECONDARY_EMAIL,
        status: 'PENDING',
        usedAt: null,
      },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITE_HOURS * 60 * 60 * 1000)
    const invite = await prisma.userInvite.create({
      data: {
        tenantId: tenant.id,
        email: SECONDARY_EMAIL,
        emailNormalizado: SECONDARY_EMAIL,
        tokenHash: sha256(`${token}:${tokenPepper}`),
        expiresAt,
        createdBy: primary.id,
      },
    })

    await prisma.authAuditLog.create({
      data: {
        tenantId: tenant.id,
        adminUserId: primary.id,
        inviteId: invite.id,
        action: 'INVITE_CREATED',
        identifier: SECONDARY_EMAIL,
        metadata: { source: 'hml_secure_bootstrap' },
      },
    })

    const inviteLink = `${LOCAL_APP_URL}/auth/invite?token=${encodeURIComponent(token)}`
    writeFileSync(invitePath, [
      'Convite administrativo Brookie Pregiato - HML',
      '',
      `Nome: ${SECONDARY_NAME}`,
      `E-mail: ${SECONDARY_EMAIL}`,
      `Valido ate: ${expiresAt.toISOString()}`,
      '',
      inviteLink,
      '',
      'Este link e de uso unico. A Nicolly deve definir a propria senha e depois vincular o proprio autenticador.',
      'Exclua este arquivo depois que o cadastro for concluido.',
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o600 })
    inviteCreated = true
  }

  console.log(JSON.stringify({
    tenant: TENANT_SLUG,
    primaryEmailConfigured: true,
    secondaryAlreadyRegistered: Boolean(secondary),
    inviteCreated,
    inviteFile: inviteCreated ? invitePath : null,
    allowlistCount: 2,
    secretsPrinted: false,
  }))
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'HML_ADMIN_BOOTSTRAP_FAILED')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
