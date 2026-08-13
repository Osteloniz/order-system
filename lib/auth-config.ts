import { isAdminAllowlistReady } from '@/lib/admin-allowlist'

export function getAuthSecurityConfiguration() {
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY?.trim() || ''
  let encryptionKeyValid = false
  try {
    encryptionKeyValid = Buffer.from(encryptionKey, 'base64').length === 32
  } catch {
    encryptionKeyValid = false
  }

  return {
    nextAuthSecret: (process.env.NEXTAUTH_SECRET?.trim().length || 0) >= 32,
    tokenPepper: (process.env.TOKEN_PEPPER?.trim().length || 0) >= 32,
    adminAccessKey: (process.env.ADMIN_ACCESS_KEY?.trim().length || 0) >= 16,
    encryptionKey: encryptionKeyValid,
    allowlist: isAdminAllowlistReady(),
  }
}

export function isAuthSecurityConfigurationReady() {
  return Object.values(getAuthSecurityConfiguration()).every(Boolean)
}
