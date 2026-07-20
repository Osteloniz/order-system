const COUPOM_SEM_EXPIRACAO_ISO = '2099-12-31T23:59:59.999-03:00'
const COUPOM_SEM_EXPIRACAO_MIN_YEAR = 2099

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getCouponNoExpiryDate() {
  return new Date(COUPOM_SEM_EXPIRACAO_ISO)
}

export function isCouponWithoutExpiration(value: string | Date | null | undefined) {
  const date = toDate(value)
  if (!date) return false
  return date.getUTCFullYear() >= COUPOM_SEM_EXPIRACAO_MIN_YEAR
}

export function isCouponExpired(value: string | Date | null | undefined, now = new Date()) {
  const date = toDate(value)
  if (!date) return false
  if (isCouponWithoutExpiration(date)) return false
  return date.getTime() <= now.getTime()
}

export function buildCouponExpiryDate(value?: string | null) {
  const normalized = value?.trim() || ''
  if (!normalized) {
    return getCouponNoExpiryDate()
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const invalidDate = new Date('invalid')
    return invalidDate
  }

  return new Date(`${normalized}T23:59:59.999-03:00`)
}

export function formatCouponExpiryDateInput(value: string | Date | null | undefined) {
  if (!value || isCouponWithoutExpiration(value)) return ''

  const date = toDate(value)
  if (!date) return ''

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(date)
}

export function formatCouponExpiryLabel(value: string | Date | null | undefined) {
  if (!value || isCouponWithoutExpiration(value)) {
    return 'Sem expiracao'
  }

  const date = toDate(value)
  if (!date) return 'Data invalida'

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function serializeCouponExpiryDate(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
}
