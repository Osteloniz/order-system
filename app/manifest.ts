import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Brookie Pregiato - Pedidos Online',
    short_name: 'Brookie',
    description: 'Pedidos online da Brookie Pregiato.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f5ef',
    theme_color: '#315c4a',
    orientation: 'portrait',
    categories: ['food', 'shopping'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
