function rawPhoneDigits(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function normalizeBrazilPhoneDigits(digits: string) {
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    const localDigits = digits.slice(2)
    if (localDigits.length === 10 || localDigits.length === 11) {
      return localDigits
    }
  }

  return digits
}

export function normalizePhone(value?: string | null) {
  return normalizeBrazilPhoneDigits(rawPhoneDigits(value))
}

export function getPhoneLookupCandidates(value?: string | null) {
  const rawDigits = rawPhoneDigits(value)
  const normalized = normalizePhone(value)
  const candidates = new Set<string>()

  if (rawDigits) candidates.add(rawDigits)
  if (normalized) candidates.add(normalized)
  if (normalized && normalized.length <= 11) candidates.add(`55${normalized}`)

  return Array.from(candidates).filter(Boolean)
}

export function isValidPhone(value?: string | null) {
  const digits = normalizePhone(value)
  if (!digits) return false
  return digits.length >= 8 && digits.length <= 15
}

export function formatPhoneInput(value: string) {
  const trimmed = value.trim()
  const hasLeadingPlus = trimmed.startsWith('+')
  const rawDigits = rawPhoneDigits(value).slice(0, 15)
  const digits = normalizeBrazilPhoneDigits(rawDigits).slice(0, 15)

  if (!digits) return ''

  if ((digits.length > 11 || hasLeadingPlus) && !(digits.length === 10 || digits.length === 11)) {
    return `+${rawDigits}`
  }

  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function formatPhoneDisplay(value?: string | null) {
  const digits = normalizePhone(value)
  if (!digits) return '-'

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  return digits.length > 11 ? `+${digits}` : digits
}

export function toWhatsappDigits(value?: string | null) {
  const digits = normalizePhone(value)
  if (!digits) return ''
  return digits.length <= 11 ? `55${digits}` : digits
}

export function buildWhatsappUrl(value: string | null | undefined, message: string) {
  const digits = toWhatsappDigits(value)
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
