import { prisma } from '@/lib/db'
import {
  buildInviteLink,
  buildUsernameCandidateFromEmail,
  generateSecureToken,
  getInviteExpiryDate,
  hashOpaqueToken,
  hashPassword,
  maskEmail,
  normalizeAdminUsername,
  normalizeEmail,
} from '@/lib/auth-security'
import { resolveInviteStatus } from '@/lib/invite-status'
import { getAdminUserLimit } from '@/lib/admin-allowlist'

export async function createUserInvite(params: {
  tenantId: string
  email: string
  createdBy?: string | null
}) {
  const normalizedEmail = normalizeEmail(params.email)
  const currentUserCount = await prisma.adminUser.count({
    where: { tenantId: params.tenantId },
  })
  if (currentUserCount >= getAdminUserLimit()) {
    throw new Error('ADMIN_USER_LIMIT_REACHED')
  }
  const existingUser = await prisma.adminUser.findFirst({
    where: {
      tenantId: params.tenantId,
      emailNormalizado: normalizedEmail,
    },
    select: { id: true, ativo: true },
  })

  if (existingUser) {
    throw new Error('Ja existe um usuario vinculado a este e-mail.')
  }

  await prisma.userInvite.updateMany({
    where: {
      tenantId: params.tenantId,
      emailNormalizado: normalizedEmail,
      status: 'PENDING',
      usedAt: null,
      revokedAt: null,
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  })

  const token = generateSecureToken()
  const invite = await prisma.userInvite.create({
    data: {
      tenantId: params.tenantId,
      email: normalizedEmail,
      emailNormalizado: normalizedEmail,
      tokenHash: hashOpaqueToken(token),
      expiresAt: getInviteExpiryDate(),
      createdBy: params.createdBy ?? null,
    },
  })

  return {
    invite,
    token,
    inviteLink: buildInviteLink(token),
  }
}

export async function findInviteByToken(token: string) {
  if (!token?.trim()) return null

  const invite = await prisma.userInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token.trim()) },
  })

  if (!invite) return null
  return invite
}

export async function validateInviteToken(token: string) {
  const invite = await findInviteByToken(token)
  if (!invite) {
    return { valid: false as const, reason: 'INVALID' as const }
  }

  const resolvedStatus = resolveInviteStatus(invite)
  if (resolvedStatus !== 'PENDING') {
    return { valid: false as const, reason: resolvedStatus, invite }
  }

  const existingUser = await prisma.adminUser.findFirst({
    where: {
      tenantId: invite.tenantId,
      emailNormalizado: invite.emailNormalizado,
    },
    select: { id: true, ativo: true },
  })

  if (existingUser?.ativo) {
    return { valid: false as const, reason: 'ALREADY_REGISTERED' as const, invite }
  }

  return {
    valid: true as const,
    invite,
    emailHint: maskEmail(invite.email),
    stage: existingUser ? 'MFA' as const : 'PASSWORD' as const,
    user: existingUser,
  }
}

export async function buildUniqueUsernameForTenant(tenantId: string, email: string) {
  const base = buildUsernameCandidateFromEmail(email)

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`
    const candidate = `${base}${suffix}`.slice(0, 50)
    const existing = await prisma.adminUser.findFirst({
      where: { tenantId, username: candidate },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  throw new Error('Nao foi possivel gerar um username unico para este convite.')
}

export async function registerInvitedUser(params: {
  token: string
  nome: string
  username: string
  password: string
}) {
  const validation = await validateInviteToken(params.token)
  if (!validation.valid) {
    return validation
  }

  const invite = validation.invite
  if (validation.stage === 'MFA' && validation.user) {
    const user = await prisma.adminUser.findUnique({ where: { id: validation.user.id } })
    if (!user) throw new Error('INVITE_NOT_AVAILABLE')
    return { valid: true as const, invite, user, created: false as const }
  }
  const username = normalizeAdminUsername(params.username)
  const passwordHash = await hashPassword(params.password)

  const result = await prisma.$transaction(async tx => {
    const refreshed = await tx.userInvite.findUnique({
      where: { id: invite.id },
    })

    if (!refreshed || resolveInviteStatus(refreshed) !== 'PENDING') {
      throw new Error('INVITE_NOT_AVAILABLE')
    }

    const existingUser = await tx.adminUser.findFirst({
      where: {
        tenantId: refreshed.tenantId,
        emailNormalizado: refreshed.emailNormalizado,
      },
      select: { id: true },
    })

    if (existingUser) {
      throw new Error('EMAIL_ALREADY_REGISTERED')
    }

    const existingUsername = await tx.adminUser.findFirst({
      where: {
        tenantId: refreshed.tenantId,
        username: { equals: username, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (existingUsername) throw new Error('USERNAME_ALREADY_REGISTERED')

    const allUsers = await tx.adminUser.count({
      where: { tenantId: refreshed.tenantId },
    })
    if (allUsers >= getAdminUserLimit()) {
      throw new Error('ADMIN_USER_LIMIT_REACHED')
    }

    const user = await tx.adminUser.create({
      data: {
        tenantId: refreshed.tenantId,
        nome: params.nome.trim(),
        username,
        email: refreshed.email,
        emailNormalizado: refreshed.emailNormalizado,
        passwordHash,
        ativo: false,
        role: 'ADMIN',
      },
    })

    return {
      user,
      invite: refreshed,
    }
  })

  return {
    valid: true as const,
    invite: result.invite,
    user: result.user,
    created: true as const,
  }
}
