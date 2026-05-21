type RateEntry = {
  count: number
  firstRequest: number
  blockedUntil?: number
}

const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS = 5
const BLOCK_MS = 10 * 60 * 1000

const store = new Map<string, RateEntry>()

function checkRateLimit(key: string) {
  const now = Date.now()
  const current = store.get(key)

  if (current?.blockedUntil && current.blockedUntil > now) {
    return { allowed: false }
  }

  if (!current || now - current.firstRequest > WINDOW_MS) {
    store.set(key, { count: 1, firstRequest: now })
    return { allowed: true }
  }

  current.count += 1
  if (current.count > MAX_ATTEMPTS) {
    current.blockedUntil = now + BLOCK_MS
    store.set(key, current)
    return { allowed: false }
  }

  store.set(key, current)
  return { allowed: true }
}

export function rateLimitByIp(ip: string) {
  return checkRateLimit(`ip:${ip}`)
}

export function rateLimitByIdentifier(ip: string, identifier: string) {
  return checkRateLimit(`identifier:${ip}:${identifier.trim().toLowerCase()}`)
}

export function resetRateLimitByIp(ip: string) {
  store.delete(`ip:${ip}`)
}

export function resetRateLimitByIdentifier(ip: string, identifier: string) {
  store.delete(`identifier:${ip}:${identifier.trim().toLowerCase()}`)
}
