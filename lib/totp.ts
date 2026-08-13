import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_DIGITS = 6
const TOTP_PERIOD_SECONDS = 30
const RECOVERY_CODE_COUNT = 8

function encodeBase32(input: Buffer) {
  let bits = ''
  for (const byte of input) bits += byte.toString(2).padStart(8, '0')

  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0')
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)]
  }
  return output
}

function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character)
    if (value < 0) throw new Error('INVALID_BASE32_SECRET')
    bits += value.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

function getEncryptionKey() {
  const raw = process.env.AUTH_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('AUTH_ENCRYPTION_KEY_NOT_CONFIGURED')

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY_INVALID')
  return key
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptTotpSecret(payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('INVALID_ENCRYPTED_TOTP_SECRET')
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20))
}

export function getTotpStep(timestampMs = Date.now()) {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS)
}

export function generateTotpCode(secret: string, step = getTotpStep()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

export function verifyTotpCode(secret: string, token: string, timestampMs = Date.now()) {
  const normalized = token.replace(/\D/g, '')
  if (!/^\d{6}$/.test(normalized)) return null

  const currentStep = getTotpStep(timestampMs)
  for (const delta of [-1, 0, 1]) {
    const step = currentStep + delta
    if (generateTotpCode(secret, step) === normalized) return step
  }
  return null
}

export function buildTotpUri(params: { email: string; secret: string }) {
  const issuer = 'Brookie Pregiato'
  const label = `${issuer}:${params.email}`
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`
}

export function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(5).toString('hex').toUpperCase()
    return `${value.slice(0, 5)}-${value.slice(5)}`
  })
}

export function normalizeRecoveryCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-F0-9]/g, '')
  return compact.length === 10 ? `${compact.slice(0, 5)}-${compact.slice(5)}` : ''
}

export function hashRecoveryCode(value: string) {
  return createHash('sha256')
    .update(`mfa-recovery:${normalizeRecoveryCode(value)}:${process.env.TOKEN_PEPPER?.trim() || ''}`)
    .digest('hex')
}

export function hashRecoveryCodes(codes: string[]) {
  return codes.map(hashRecoveryCode)
}
