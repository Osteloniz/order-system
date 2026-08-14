import { prisma } from '@/lib/db'
import { hashRecoveryCode, normalizeRecoveryCode, decryptTotpSecret, verifyTotpCode } from '@/lib/totp'

export type SecondFactorResult =
  | { valid: true; method: 'totp'; step: number }
  | { valid: true; method: 'recovery' }
  | { valid: false; reason: 'missing' | 'invalid' | 'replayed' | 'not_configured' }

function readRecoveryHashes(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function verifyAdminSecondFactor(user: {
  id: string
  totpSecretEncrypted: string | null
  totpEnabledAt: Date | null
  totpLastUsedStep: bigint | null
  recoveryCodeHashes: unknown
}, input?: string | null): Promise<SecondFactorResult> {
  if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
    return { valid: false, reason: 'not_configured' }
  }

  const code = input?.trim() || ''
  if (!code) return { valid: false, reason: 'missing' }

  const recoveryCode = normalizeRecoveryCode(code)
  if (recoveryCode) {
    const recoveryHashes = readRecoveryHashes(user.recoveryCodeHashes)
    const usedHash = hashRecoveryCode(recoveryCode)
    if (!recoveryHashes.includes(usedHash)) return { valid: false, reason: 'invalid' }

    const remaining = recoveryHashes.filter(hash => hash !== usedHash)
    const consumed = await prisma.adminUser.updateMany({
      where: {
        id: user.id,
        recoveryCodeHashes: { equals: recoveryHashes },
      },
      data: { recoveryCodeHashes: remaining },
    })
    if (consumed.count !== 1) return { valid: false, reason: 'replayed' }
    return { valid: true, method: 'recovery' }
  }

  let secret: string
  try {
    secret = decryptTotpSecret(user.totpSecretEncrypted)
  } catch {
    return { valid: false, reason: 'invalid' }
  }

  const step = verifyTotpCode(secret, code)
  if (step === null) return { valid: false, reason: 'invalid' }

  const consumed = await prisma.adminUser.updateMany({
    where: {
      id: user.id,
      OR: [
        { totpLastUsedStep: null },
        { totpLastUsedStep: { lt: BigInt(step) } },
      ],
    },
    data: { totpLastUsedStep: BigInt(step) },
  })

  if (consumed.count !== 1) return { valid: false, reason: 'replayed' }
  return { valid: true, method: 'totp', step }
}
