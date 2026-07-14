type RateEntry = {
  count: number
  firstRequest: number
  blockedUntil?: number
}

const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS = 5
const BLOCK_MS = 10 * 60 * 1000

const store = new Map<string, RateEntry>()
const publicStore = new Map<string, RateEntry>()

function checkRateLimit(key: string, targetStore = store, windowMs = WINDOW_MS, maxAttempts = MAX_ATTEMPTS, blockMs = BLOCK_MS) {
  const now = Date.now()
  const current = targetStore.get(key)

  if (current?.blockedUntil && current.blockedUntil > now) {
    return { allowed: false }
  }

  if (!current || now - current.firstRequest > windowMs) {
    targetStore.set(key, { count: 1, firstRequest: now })
    return { allowed: true }
  }

  current.count += 1
  if (current.count > maxAttempts) {
    current.blockedUntil = now + blockMs
    targetStore.set(key, current)
    return { allowed: false }
  }

  targetStore.set(key, current)
  return { allowed: true }
}

export function rateLimitByIp(ip: string) {
  return checkRateLimit(`ip:${ip}`)
}

export function rateLimitByIdentifier(ip: string, identifier: string) {
  return checkRateLimit(`identifier:${ip}:${identifier.trim().toLowerCase()}`)
}

export function rateLimitPublicPrefill(ip: string, tenantId: string) {
  return checkRateLimit(`prefill:${tenantId}:${ip}`, publicStore, 60 * 1000, 12, 5 * 60 * 1000)
}

export function resetRateLimitByIp(ip: string) {
  store.delete(`ip:${ip}`)
}

export function resetRateLimitByIdentifier(ip: string, identifier: string) {
  store.delete(`identifier:${ip}:${identifier.trim().toLowerCase()}`)
}
