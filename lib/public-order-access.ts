import { generateSecureToken, hashOpaqueToken, safeEqualString } from '@/lib/auth-security'

export const ORDER_ACCESS_HEADER = 'x-order-access-token'

export function generatePublicOrderAccessToken() {
  return generateSecureToken(24)
}

export function hashPublicOrderAccessToken(token: string) {
  return hashOpaqueToken(token.trim())
}

export function isValidPublicOrderAccessToken(token?: string | null, expectedHash?: string | null) {
  if (!token?.trim() || !expectedHash?.trim()) return false
  return safeEqualString(hashPublicOrderAccessToken(token), expectedHash)
}
