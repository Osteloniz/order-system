import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'

const DEFAULT_BCRYPT_ROUNDS = 12
const DEFAULT_INVITE_EXPIRY_HOURS = 24

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function normalizeLoginIdentifier(identifier: string) {
  return identifier.trim()
}

export function getTokenPepper() {
  return process.env.TOKEN_PEPPER?.trim() || ''
}

export function generateSecureToken(bytes = 32) {
  return randomBytes(bytes).toString('hex')
}

export function hashOpaqueToken(token: string) {
  return createHash('sha256')
    .update(`${token}:${getTokenPepper()}`)
    .digest('hex')
}

export function hashIpAddress(ip: string) {
  return createHash('sha256')
    .update(`ip:${ip}:${getTokenPepper()}`)
    .digest('hex')
}

export function maskEmail(email: string) {
  const normalized = normalizeEmail(email)
  const [local, domain] = normalized.split('@')
  if (!local || !domain) return normalized

  const visibleLocal = local.length <= 2 ? local[0] ?? '*' : `${local.slice(0, 2)}***`
  return `${visibleLocal}@${domain}`
}

export function getInviteExpiryDate() {
  const hours = Number(process.env.INVITE_EXPIRY_HOURS || DEFAULT_INVITE_EXPIRY_HOURS)
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_INVITE_EXPIRY_HOURS))
  return expiresAt
}

export async function hashPassword(password: string) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || DEFAULT_BCRYPT_ROUNDS)
  const safeRounds = Number.isFinite(rounds) && rounds >= 10 ? rounds : DEFAULT_BCRYPT_ROUNDS
  return bcrypt.hash(password, safeRounds)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value)
}

export function safeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

export function buildInviteLink(token: string) {
  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'

  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl
  return `${base}/auth/invite?token=${encodeURIComponent(token)}`
}

export function buildUsernameCandidateFromEmail(email: string) {
  const [localPart] = normalizeEmail(email).split('@')
  const base = (localPart || 'admin').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (base || 'admin').slice(0, 40)
}
