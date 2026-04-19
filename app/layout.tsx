import React from "react"
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brookie Pregiato - Pedidos Online',
  description: 'Faca seu pedido online de forma rapida e pratica. Doces, brownies e muito mais!',
  applicationName: 'Brookie Pregiato',
  manifest: '/manifest.webmanifest',
  generator: 'v0.app',
  appleWebApp: {
    capable: true,
    title: 'Brookie',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#315c4a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  )
}
