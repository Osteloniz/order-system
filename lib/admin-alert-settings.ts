export const ADMIN_ALERTS_STORAGE_KEY = 'brookie-admin-alertas-pedidos'
export const ADMIN_ALERT_SOUND_STORAGE_KEY = 'brookie-admin-alertas-som'

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function getAdminAlertsEnabled() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(ADMIN_ALERTS_STORAGE_KEY) === 'enabled'
}

export function setAdminAlertsEnabled(enabled: boolean) {
  window.localStorage.setItem(ADMIN_ALERTS_STORAGE_KEY, enabled ? 'enabled' : 'disabled')
}

export function getAdminAlertSoundEnabled() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(ADMIN_ALERT_SOUND_STORAGE_KEY) !== 'disabled'
}

export function setAdminAlertSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(ADMIN_ALERT_SOUND_STORAGE_KEY, enabled ? 'enabled' : 'disabled')
}
