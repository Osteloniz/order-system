'use client'

import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.error('[pwa] Falha ao registrar service worker:', error)
      })
    })
  }, [])

  return null
}
