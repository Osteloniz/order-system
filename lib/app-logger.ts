type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDERED_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function getConfiguredLogLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase()
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured
  }

  return process.env.NODE_ENV === 'production' ? 'warn' : 'info'
}

function shouldLog(level: LogLevel) {
  return ORDERED_LEVELS[level] >= ORDERED_LEVELS[getConfiguredLogLevel()]
}

export const appLogger = {
  debug(message: string, ...args: unknown[]) {
    if (!shouldLog('debug')) return
    console.debug(message, ...args)
  },
  info(message: string, ...args: unknown[]) {
    if (!shouldLog('info')) return
    console.info(message, ...args)
  },
  warn(message: string, ...args: unknown[]) {
    if (!shouldLog('warn')) return
    console.warn(message, ...args)
  },
  error(message: string, ...args: unknown[]) {
    console.error(message, ...args)
  },
}
