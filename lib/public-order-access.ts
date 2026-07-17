import type { NextRequest, NextResponse } from 'next/server'
import { generateSecureToken, hashOpaqueToken, safeEqualString } from '@/lib/auth-security'

export const ORDER_ACCESS_HEADER = 'x-order-access-token'
const ORDER_ACCESS_COOKIE_PREFIX = 'brookie.order-access.'
const ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function generatePublicOrderAccessToken() {
  return generateSecureToken(24)
}

export function hashPublicOrderAccessToken(token: string) {
  return hashOpaqueToken(token.trim())
}

export function isValidPublicOrderAccessToken(token?: string | null, expectedHash?: string | null) {
  if (!token?.trim() || !expectedHash?.trim()) return false
  return safeEqualString(hashPublicOrderAccessToken(token), expectedHash)
}

export function getPublicOrderAccessCookieName(orderId: string) {
  return `${ORDER_ACCESS_COOKIE_PREFIX}${orderId}`
}

export function getPublicOrderAccessToken(request: NextRequest, orderId: string) {
  const headerToken = request.headers.get(ORDER_ACCESS_HEADER)?.trim()
  if (headerToken) return headerToken

  const queryToken = request.nextUrl.searchParams.get('token')?.trim()
  if (queryToken) return queryToken

  return request.cookies.get(getPublicOrderAccessCookieName(orderId))?.value?.trim() || ''
}

export function setPublicOrderAccessCookie(response: NextResponse, orderId: string, token: string) {
  response.cookies.set({
    name: getPublicOrderAccessCookieName(orderId),
    value: token.trim(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS,
  })
}

export function generateAsaasReturnToken() {
  return generateSecureToken(24)
}

export function hashAsaasReturnToken(token: string) {
  return hashOpaqueToken(token.trim())
}

export function isValidAsaasReturnToken(token?: string | null, expectedHash?: string | null) {
  if (!token?.trim() || !expectedHash?.trim()) return false
  return safeEqualString(hashAsaasReturnToken(token), expectedHash)
}
