'use client'

import type { Pedido } from '@/lib/types'

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
const MAX_RECENT_ORDERS = 5

function normalizeContact(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function getOrdersKeyForContact(contact?: string | null) {
  const normalized = normalizeContact(contact)
  return normalized ? `${ORDERS_KEY}.${normalized}` : ORDERS_KEY
}

export function getCustomerProfile(): CustomerProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCustomerProfile(profile: CustomerProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function getRecentOrderIds() {
  try {
    const profile = getCustomerProfile()
    const contact = normalizeContact(profile?.whatsapp || profile?.telefone)
    if (!contact) return []

    const raw = window.localStorage.getItem(getOrdersKeyForContact(contact))
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveRecentOrder(pedido: Pick<Pedido, 'id' | 'clienteTelefone' | 'clienteWhatsapp'>) {
  const contact = normalizeContact(pedido.clienteWhatsapp || pedido.clienteTelefone)
  const storageKey = getOrdersKeyForContact(contact)
  const ids = getRecentOrderIds().filter((id) => id !== pedido.id)
  window.localStorage.setItem(
    storageKey,
    JSON.stringify([pedido.id, ...ids].slice(0, MAX_RECENT_ORDERS))
  )
}

export function clearRecentOrdersForCurrentCustomer() {
  const profile = getCustomerProfile()
  const contact = normalizeContact(profile?.whatsapp || profile?.telefone)
  window.localStorage.removeItem(getOrdersKeyForContact(contact))
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
