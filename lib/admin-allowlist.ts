const REQUIRED_ADMIN_COUNT = 2

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function getAllowedAdminEmails() {
  const emails = (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)

  return [...new Set(emails)]
}

export function isAdminAllowlistReady() {
  return getAllowedAdminEmails().length === REQUIRED_ADMIN_COUNT
}

export function isAllowedAdminEmail(email?: string | null) {
  const normalized = normalizeEmail(email || '')
  const allowed = getAllowedAdminEmails()

  if (allowed.length === 0 && process.env.NODE_ENV !== 'production') {
    return true
  }

  return allowed.length === REQUIRED_ADMIN_COUNT && allowed.includes(normalized)
}

export function assertAllowedAdminEmail(email: string) {
  if (!isAllowedAdminEmail(email)) {
    throw new Error('ADMIN_EMAIL_NOT_ALLOWED')
  }
}

export function getAdminUserLimit() {
  return REQUIRED_ADMIN_COUNT
}
