'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Archive, BarChart3, ClipboardList, FileClock, Package, Tags, Settings, LogOut, Store, Menu, X, BadgePercent, ChefHat, Users } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

const menuItems = [
  { href: '/admin', label: 'Pedidos', icon: ClipboardList },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/producao', label: 'Produção', icon: ChefHat },
  { href: '/admin/estoque', label: 'Estoque', icon: Archive },
  { href: '/admin/logs', label: 'Logs', icon: FileClock },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias', icon: Tags },
  { href: '/admin/cupons', label: 'Cupons', icon: BadgePercent },
  { href: '/admin/config', label: 'Configurações', icon: Settings },
]

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function AdminSidebar() {
  const pathname = usePathname()
  const { logout } = useAdminAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: tenantData } = useSWR('/api/admin/tenant', fetcher)
  const tenantNome = tenantData?.nome ?? 'Painel Admin'

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex min-h-14 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 text-primary">
          <Store className="h-5 w-5" />
          <span className="max-w-[60vw] truncate font-bold">{tenantNome}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-background/80 pt-[calc(env(safe-area-inset-top)+3.5rem)] backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        >
          <nav className="h-full w-[min(18rem,85vw)] overflow-y-auto border-r border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)] space-y-2" onClick={e => e.stopPropagation()}>
            {menuItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-border">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                onClick={logout}
              >
                <LogOut className="h-5 w-5" />
                Sair
              </Button>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <Store className="h-6 w-6" />
            <span className="text-xl font-bold">{tenantNome}</span>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2">
          {menuItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
            Sair
          </Button>
        </div>
      </aside>
    </>
  )
}
