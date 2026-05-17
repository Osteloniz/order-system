const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'

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
