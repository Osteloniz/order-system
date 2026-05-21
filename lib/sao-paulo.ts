const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'

function getDatePartsInSaoPaulo(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  }
}

export function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function formatDateTimeInSaoPaulo(value?: string | Date | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function formatDateInSaoPaulo(value: string | Date) {
  const normalizedValue =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00-03:00`
      : value

  return new Date(normalizedValue).toLocaleDateString('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: 'short',
  })
}

export function formatLongDateInSaoPaulo(value?: string | Date | null) {
  if (!value) return '-'

  const normalizedValue = (() => {
    if (value instanceof Date) return value
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return `${value.slice(0, 10)}T12:00:00-03:00`
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [day, month, year] = value.split('/')
      return `${year}-${month}-${day}T12:00:00-03:00`
    }
    return value
  })()

  const parsed = new Date(normalizedValue)
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : '-'
  }

  return parsed.toLocaleDateString('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: 'full',
  })
}

export function getCurrentWeekRangeInSaoPaulo() {
  const now = new Date()
  const { year, month, day, weekday } = getDatePartsInSaoPaulo(now)
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const currentDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const distanceFromSunday = weekdayMap[weekday] ?? 0
  const start = new Date(currentDate)
  start.setUTCDate(currentDate.getUTCDate() - distanceFromSunday)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  const format = (value: Date) =>
    `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`

  return {
    from: format(start),
    to: format(end),
  }
}
