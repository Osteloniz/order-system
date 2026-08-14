import { cookies } from 'next/headers'
import {
  ADMIN_ACCESS_MAX_AGE_SECONDS,
  createSignedAdminAccessCookie,
  hasSignedAdminAccessCookie,
  isValidAdminAccessKey,
} from '@/lib/admin-access-token'

export { isValidAdminAccessKey }

export const ADMIN_ACCESS_COOKIE = 'admin-access-granted'

export function isAdminAccessEnabled() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.ADMIN_ACCESS_KEY?.trim())
}

export function isAdminAccessConfigured() {
  return (process.env.ADMIN_ACCESS_KEY?.trim().length || 0) >= 16
    && (process.env.TOKEN_PEPPER?.trim().length || 0) >= 32
}

export async function hasAdminAccessCookie(cookieValue?: string | null) {
  if (!isAdminAccessEnabled()) return true
  return hasSignedAdminAccessCookie(cookieValue)
}

export async function hasServerAdminAccess() {
  if (!isAdminAccessEnabled()) return true
  const cookieStore = await cookies()
  return hasAdminAccessCookie(cookieStore.get(ADMIN_ACCESS_COOKIE)?.value)
}

export function getAdminAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_ACCESS_MAX_AGE_SECONDS,
  }
}

export async function getAdminAccessCookieValue() {
  return createSignedAdminAccessCookie()
}
