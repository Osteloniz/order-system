export function normalizePhone(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

export function isValidPhone(value?: string | null) {
  const digits = normalizePhone(value)
  if (!digits) return false
  return digits.length >= 8 && digits.length <= 15
}

export function formatPhoneInput(value: string) {
  const trimmed = value.trim()
  const hasLeadingPlus = trimmed.startsWith('+')
  const digits = normalizePhone(value).slice(0, 15)

  if (!digits) return ''

  if (hasLeadingPlus || digits.length > 11) {
    return `+${digits}`
  }

  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function formatPhoneDisplay(value?: string | null) {
  const digits = normalizePhone(value)
  if (!digits) return '-'

  const brasil = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits

  if (brasil.length === 10) {
    return `(${brasil.slice(0, 2)}) ${brasil.slice(2, 6)}-${brasil.slice(6)}`
  }

  if (brasil.length === 11) {
    return `(${brasil.slice(0, 2)}) ${brasil.slice(2, 7)}-${brasil.slice(7)}`
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
