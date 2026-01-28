type RateEntry = {
  count: number
  firstRequest: number
  blockedUntil?: number
}

const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS = 5
const BLOCK_MS = 10 * 60 * 1000

const store = new Map<string, RateEntry>()

export function rateLimitByIp(ip: string) {
  const now = Date.now()
  const current = store.get(ip)

  if (current?.blockedUntil && current.blockedUntil > now) {
    return { allowed: false }
  }

  if (!current || now - current.firstRequest > WINDOW_MS) {
    store.set(ip, { count: 1, firstRequest: now })
    return { allowed: true }
  }

  current.count += 1
  if (current.count > MAX_ATTEMPTS) {
    current.blockedUntil = now + BLOCK_MS
    store.set(ip, current)
    return { allowed: false }
  }

  store.set(ip, current)
  return { allowed: true }
}
