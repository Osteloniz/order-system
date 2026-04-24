import { cookies } from 'next/headers'

export const ADMIN_ACCESS_COOKIE = 'admin-access-granted'
const ACCESS_COOKIE_VALUE = 'ok'

export function isAdminAccessEnabled() {
  return Boolean(process.env.ADMIN_ACCESS_KEY?.trim())
}

export function isValidAdminAccessKey(input: string) {
  const expected = process.env.ADMIN_ACCESS_KEY?.trim()
  if (!expected) return false
  return input.trim() === expected
}

export function hasAdminAccessCookie(cookieValue?: string | null) {
  if (!isAdminAccessEnabled()) return true
  return cookieValue === ACCESS_COOKIE_VALUE
}

export async function hasServerAdminAccess() {
  if (!isAdminAccessEnabled()) return true
  const cookieStore = await cookies()
  return hasAdminAccessCookie(cookieStore.get(ADMIN_ACCESS_COOKIE)?.value)
}

export function getAdminAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  }
}

export function getAdminAccessCookieValue() {
  return ACCESS_COOKIE_VALUE
}
