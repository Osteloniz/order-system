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
  return getAllowedAdminEmails().length > 0
}

export function isAllowedAdminEmail(email?: string | null) {
  const normalized = normalizeEmail(email || '')
  const allowed = getAllowedAdminEmails()

  if (allowed.length === 0 && process.env.NODE_ENV !== 'production') {
    return true
  }

  return allowed.includes(normalized)
}

export function assertAllowedAdminEmail(email: string) {
  if (!isAllowedAdminEmail(email)) {
    throw new Error('ADMIN_EMAIL_NOT_ALLOWED')
  }
}

export function getAdminUserLimit() {
  const configured = Number(process.env.ADMIN_USER_LIMIT || 10)
  return Number.isInteger(configured) && configured >= 2 && configured <= 50 ? configured : 10
}
