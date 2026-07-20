import type { LojaClosureReason } from '@/lib/types'

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo'

type StoreHoursInput = {
  manualIsOpen: boolean
  scheduleEnabled?: boolean | null
  openTime?: string | null
  closeTime?: string | null
  now?: Date
}

export type StoreHoursStatus = {
  isOpen: boolean
  manualOpen: boolean
  scheduleEnabled: boolean
  openTime: string | null
  closeTime: string | null
  scheduleSummary: string | null
  closureReason: LojaClosureReason | null
  statusLabel: string
  message: string
}

function parseTimeToMinutes(value?: string | null) {
  const normalized = value?.trim() || ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized)
  if (!match) return null

  return Number(match[1]) * 60 + Number(match[2])
}

function getSaoPauloMinutes(now: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return hour * 60 + minute
}

function isWithinSchedule(nowMinutes: number, openMinutes: number, closeMinutes: number) {
  if (openMinutes === closeMinutes) return false
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes
  }

  return nowMinutes >= openMinutes || nowMinutes < closeMinutes
}

export function formatScheduleSummary(openTime?: string | null, closeTime?: string | null) {
  if (!openTime || !closeTime) return null
  return `${openTime} as ${closeTime}`
}

export function resolveStoreHoursStatus(input: StoreHoursInput): StoreHoursStatus {
  const scheduleEnabled = Boolean(input.scheduleEnabled)
  const openTime = input.openTime?.trim() || null
  const closeTime = input.closeTime?.trim() || null
  const scheduleSummary = formatScheduleSummary(openTime, closeTime)

  if (!input.manualIsOpen) {
    return {
      isOpen: false,
      manualOpen: false,
      scheduleEnabled,
      openTime,
      closeTime,
      scheduleSummary,
      closureReason: 'MANUAL',
      statusLabel: 'Fechada manualmente',
      message: 'A loja fechou manualmente o checkout no momento.',
    }
  }

  if (!scheduleEnabled) {
    return {
      isOpen: true,
      manualOpen: true,
      scheduleEnabled: false,
      openTime,
      closeTime,
      scheduleSummary,
      closureReason: null,
      statusLabel: 'Aberta',
      message: 'A loja esta aberta para pedidos.',
    }
  }

  const openMinutes = parseTimeToMinutes(openTime)
  const closeMinutes = parseTimeToMinutes(closeTime)
  if (openMinutes === null || closeMinutes === null) {
    return {
      isOpen: false,
      manualOpen: true,
      scheduleEnabled: true,
      openTime,
      closeTime,
      scheduleSummary,
      closureReason: 'SCHEDULE',
      statusLabel: 'Horario invalido',
      message: 'O horario automatico da loja esta configurado de forma invalida.',
    }
  }

  const nowMinutes = getSaoPauloMinutes(input.now ?? new Date())
  const openBySchedule = isWithinSchedule(nowMinutes, openMinutes, closeMinutes)

  if (openBySchedule) {
    return {
      isOpen: true,
      manualOpen: true,
      scheduleEnabled: true,
      openTime,
      closeTime,
      scheduleSummary,
      closureReason: null,
      statusLabel: 'Aberta no horario',
      message: scheduleSummary
        ? `A loja esta recebendo pedidos dentro do horario automatico de ${scheduleSummary}.`
        : 'A loja esta aberta para pedidos.',
    }
  }

  return {
    isOpen: false,
    manualOpen: true,
    scheduleEnabled: true,
    openTime,
    closeTime,
    scheduleSummary,
    closureReason: 'SCHEDULE',
    statusLabel: 'Fora do horario',
    message: scheduleSummary
      ? `Estamos fora do horario de pedidos. O atendimento automatico funciona diariamente das ${scheduleSummary}.`
      : 'Estamos fora do horario automatico de pedidos.',
  }
}
