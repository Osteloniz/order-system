import { prisma } from '@/lib/db'
import {
  buildInviteLink,
  buildUsernameCandidateFromEmail,
  generateSecureToken,
  getInviteExpiryDate,
  hashOpaqueToken,
  hashPassword,
  maskEmail,
  normalizeEmail,
} from '@/lib/auth-security'
import { resolveInviteStatus } from '@/lib/invite-status'

export async function createUserInvite(params: {
  tenantId: string
  email: string
  createdBy?: string | null
}) {
  const normalizedEmail = normalizeEmail(params.email)
  const existingUser = await prisma.adminUser.findFirst({
    where: {
      tenantId: params.tenantId,
      emailNormalizado: normalizedEmail,
    },
    select: { id: true },
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
    select: { id: true },
  })

  if (existingUser) {
    return { valid: false as const, reason: 'ALREADY_REGISTERED' as const, invite }
  }

  return {
    valid: true as const,
    invite,
    emailHint: maskEmail(invite.email),
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
  password: string
}) {
  const validation = await validateInviteToken(params.token)
  if (!validation.valid) {
    return validation
  }

  const invite = validation.invite
  const username = await buildUniqueUsernameForTenant(invite.tenantId, invite.emailNormalizado)
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

    const user = await tx.adminUser.create({
      data: {
        tenantId: refreshed.tenantId,
        nome: params.nome.trim(),
        username,
        email: refreshed.email,
        emailNormalizado: refreshed.emailNormalizado,
        passwordHash,
      },
    })

    const updatedInvite = await tx.userInvite.update({
      where: { id: refreshed.id },
      data: {
        status: 'USED',
        usedAt: new Date(),
      },
    })

    return {
      user,
      invite: updatedInvite,
    }
  })

  return {
    valid: true as const,
    invite: result.invite,
    user: result.user,
  }
}
