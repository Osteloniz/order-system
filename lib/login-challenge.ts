import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

export const ADMIN_MFA_CHALLENGE_COOKIE = 'brookie.admin-mfa-challenge'
export const ADMIN_MFA_CHALLENGE_MAX_AGE_SECONDS = 5 * 60

export type AdminMfaChallenge = {
  userId: string
  tenantId: string
  sessionVersion: number
  identifier: string
  ipHash: string
  userAgentHash: string
  nonce: string
  expiresAt: number
}

function getEncryptionKey() {
  const raw = process.env.AUTH_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('AUTH_ENCRYPTION_KEY_NOT_CONFIGURED')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY_INVALID')
  return key
}

export function hashUserAgent(value?: string | null) {
  return createHash('sha256').update(`user-agent:${value || 'unknown'}`).digest('hex')
}

export function createAdminMfaChallenge(
  value: Omit<AdminMfaChallenge, 'nonce' | 'expiresAt'>,
) {
  const payload: AdminMfaChallenge = {
    ...value,
    nonce: randomBytes(16).toString('base64url'),
    expiresAt: Date.now() + ADMIN_MFA_CHALLENGE_MAX_AGE_SECONDS * 1000,
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  cipher.setAAD(Buffer.from('brookie-admin-mfa-challenge:v1'))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function readAdminMfaChallenge(value?: string | null) {
  if (!value) return null
  try {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.')
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) return null
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64url'))
    decipher.setAAD(Buffer.from('brookie-admin-mfa-challenge:v1'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    const payload = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')) as AdminMfaChallenge
    if (
      !payload.userId || !payload.tenantId || !payload.identifier ||
      !Number.isInteger(payload.sessionVersion) || payload.expiresAt <= Date.now()
    ) return null
    return payload
  } catch {
    return null
  }
}
