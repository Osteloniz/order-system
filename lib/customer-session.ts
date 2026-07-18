'use client'

import type { Pedido, RecentOrderReference } from '@/lib/types'

export type CustomerProfile = {
  nome: string
  telefone: string
  whatsapp: string
  bloco: string
  apartamento: string
}

const PROFILE_KEY = 'brookie.customer.profile'
const ORDERS_KEY = 'brookie.customer.orders'
const MENU_SCROLL_KEY = 'brookie.menu.scrollY'
const ORDER_LOOKUP_CONTACT_KEY = 'brookie.customer.order-lookup-contact'
const MAX_RECENT_ORDERS = 5

function isRecentOrderReference(value: unknown): value is RecentOrderReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && (candidate.accessToken == null || typeof candidate.accessToken === 'string')
}

function normalizeContact(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function getOrdersKeyForContact(contact?: string | null) {
  const normalized = normalizeContact(contact)
  return normalized ? `${ORDERS_KEY}.${normalized}` : ORDERS_KEY
}

function getProfileStorageKey(contact?: string | null) {
  const normalized = normalizeContact(contact)
  return normalized ? `${PROFILE_KEY}.${normalized}` : PROFILE_KEY
}

export function getCustomerProfile(contact?: string | null): CustomerProfile | null {
  try {
    const storageKey = getProfileStorageKey(contact)
    const raw = window.localStorage.getItem(storageKey)
    if (raw) return JSON.parse(raw)

    if (contact) {
      return null
    }

    const legacyRaw = window.localStorage.getItem(PROFILE_KEY)
    if (!legacyRaw) return null
    return JSON.parse(legacyRaw)
  } catch {
    return null
  }
}

export function saveCustomerProfile(profile: CustomerProfile) {
  const contact = normalizeContact(profile.whatsapp || profile.telefone)
  if (contact) {
    window.localStorage.setItem(getProfileStorageKey(contact), JSON.stringify(profile))
  }
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function getRecentOrders() {
  try {
    const profile = getCustomerProfile()
    const contact = normalizeContact(profile?.whatsapp || profile?.telefone)
    if (!contact) return [] as RecentOrderReference[]

    const raw = window.localStorage.getItem(getOrdersKeyForContact(contact))
    const items = raw ? JSON.parse(raw) : []
    if (!Array.isArray(items)) return [] as RecentOrderReference[]

    const normalizedItems: RecentOrderReference[] = []
    for (const item of items) {
      if (typeof item === 'string') {
        normalizedItems.push({ id: item, accessToken: null })
        continue
      }
      if (isRecentOrderReference(item)) {
        normalizedItems.push({ id: item.id, accessToken: item.accessToken?.toString() || null })
      }
    }

    return normalizedItems
  } catch {
    return [] as RecentOrderReference[]
  }
}

export function getRecentOrderIds() {
  return getRecentOrders().map((pedido) => pedido.id)
}

export function saveRecentOrder(
  pedido: Pick<Pedido, 'id' | 'clienteTelefone' | 'clienteWhatsapp'> & { accessToken?: string | null }
) {
  const contact = normalizeContact(pedido.clienteWhatsapp || pedido.clienteTelefone)
  const storageKey = getOrdersKeyForContact(contact)
  const orders = getRecentOrders().filter((item) => item.id !== pedido.id)
  window.localStorage.setItem(
    storageKey,
    JSON.stringify([{ id: pedido.id }, ...orders.map((item) => ({ id: item.id }))].slice(0, MAX_RECENT_ORDERS))
  )
}

export function clearRecentOrdersForCurrentCustomer() {
  const profile = getCustomerProfile()
  const contact = normalizeContact(profile?.whatsapp || profile?.telefone)
  window.localStorage.removeItem(getOrdersKeyForContact(contact))
}

export function getCustomerOrderLookupContact() {
  try {
    return normalizeContact(window.localStorage.getItem(ORDER_LOOKUP_CONTACT_KEY))
  } catch {
    return ''
  }
}

export function saveCustomerOrderLookupContact(contact?: string | null) {
  const normalized = normalizeContact(contact)
  if (!normalized) return
  window.localStorage.setItem(ORDER_LOOKUP_CONTACT_KEY, normalized)
}

export function clearCustomerOrderLookupContact() {
  window.localStorage.removeItem(ORDER_LOOKUP_CONTACT_KEY)
}

export function saveMenuScrollPosition() {
  window.sessionStorage.setItem(MENU_SCROLL_KEY, String(window.scrollY))
}

export function restoreMenuScrollPosition() {
  const raw = window.sessionStorage.getItem(MENU_SCROLL_KEY)
  if (!raw) return

  window.sessionStorage.removeItem(MENU_SCROLL_KEY)
  const scrollY = Number(raw)
  if (Number.isFinite(scrollY)) {
    window.setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'auto' }), 100)
  }
}
