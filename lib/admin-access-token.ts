export const ADMIN_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 12

function getSigningKey() {
  return `${process.env.ADMIN_ACCESS_KEY?.trim() || ''}:${process.env.TOKEN_PEPPER?.trim() || ''}`
}

function isSigningConfigurationReady() {
  return (process.env.ADMIN_ACCESS_KEY?.trim().length || 0) >= 16
    && (process.env.TOKEN_PEPPER?.trim().length || 0) >= 32
}

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

async function hmac(value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSigningKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))
  const binary = Array.from(new Uint8Array(signature), byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return difference === 0
}

export async function isValidAdminAccessKey(input: string) {
  if (!isSigningConfigurationReady()) return false
  const expected = process.env.ADMIN_ACCESS_KEY?.trim()
  if (!expected) return false
  const [inputHash, expectedHash] = await Promise.all([hmac(input.trim()), hmac(expected)])
  return safeEqual(inputHash, expectedHash)
}

export async function hasSignedAdminAccessCookie(cookieValue?: string | null) {
  if (!isSigningConfigurationReady()) return false
  if (!cookieValue) return false
  const [payload, signature] = cookieValue.split('.')
  if (!payload || !signature) return false
  const expectedSignature = await hmac(payload)
  if (!safeEqual(signature, expectedSignature)) return false

  try {
    const parsed = JSON.parse(decode(payload)) as { exp?: number }
    return typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export async function createSignedAdminAccessCookie() {
  if (!isSigningConfigurationReady()) {
    throw new Error('ADMIN_ACCESS_SIGNING_NOT_CONFIGURED')
  }
  const payload = encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + ADMIN_ACCESS_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID(),
  }))
  return `${payload}.${await hmac(payload)}`
}
