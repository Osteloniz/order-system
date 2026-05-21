'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Archive, ArrowDownCircle, ArrowUpCircle, BarChart3, ChevronDown, ChevronLeft, ClipboardList, FileClock, Landmark, LogOut, Menu, Package, Settings, Store, Tags, Users, X, BadgePercent, ChefHat } from 'lucide-react'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { cn } from '@/lib/utils'

const mainMenuItems = [
  { href: '/admin', label: 'Pedidos', icon: ClipboardList },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/logs', label: 'Logs', icon: FileClock },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/admin/financeiro/contas-receber', label: 'Contas a receber', icon: ArrowUpCircle },
  { href: '/admin/financeiro/fluxo-caixa', label: 'Fluxo de caixa', icon: Landmark },
  { href: '/admin/financeiro/contas-pagar', label: 'Contas a pagar', icon: ArrowDownCircle },
  { href: '/admin/config', label: 'Configurações', icon: Settings },
]

const cadastroMenuItems = [
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias de produtos', icon: Tags },
  { href: '/admin/categorias-financeiras', label: 'Categorias financeiras', icon: Landmark },
  { href: '/admin/cupons', label: 'Cupons', icon: BadgePercent },
  { href: '/admin/estoque', label: 'Estoque', icon: Archive },
  { href: '/admin/producao', label: 'Produção', icon: ChefHat },
]

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function AdminSidebar({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const pathname = usePathname()
  const { logout } = useAdminAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCadastrosOpen, setDesktopCadastrosOpen] = useState(true)
  const [mobileCadastrosOpen, setMobileCadastrosOpen] = useState(true)
  const { data: tenantData } = useSWR('/api/admin/tenant', fetcher)
  const tenantNome = tenantData?.nome ?? 'Painel Admin'

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const cadastrosActive = cadastroMenuItems.some((item) => isActive(item.href))

  useEffect(() => {
    if (cadastrosActive) {
      setDesktopCadastrosOpen(true)
      setMobileCadastrosOpen(true)
    }
  }, [cadastrosActive])

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 flex min-h-14 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] md:hidden">
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

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 pt-[calc(env(safe-area-inset-top)+3.5rem)] backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <nav
            className="h-full w-[min(18rem,85vw)] space-y-2 overflow-y-auto border-r border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            {mainMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}

            <Collapsible open={mobileCadastrosOpen} onOpenChange={setMobileCadastrosOpen} className="rounded-lg border border-border/60 bg-background/70">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                <span>Cadastros</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', mobileCadastrosOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 px-2 pb-2">
                {cadastroMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <div className="border-t border-border pt-4">
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

      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className={cn('flex min-w-0 items-center gap-2 text-primary', collapsed && 'justify-center')}>
            <Store className="h-6 w-6" />
            {!collapsed ? <span className="truncate text-xl font-bold">{tenantNome}</span> : null}
          </div>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={onToggleCollapsed}>
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {mainMenuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-3 py-3' : 'gap-3 px-4 py-3',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {!collapsed ? item.label : null}
            </Link>
          ))}

          {collapsed ? (
            <div className="space-y-2 pt-2">
              {cadastroMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    'flex items-center justify-center rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </Link>
              ))}
            </div>
          ) : (
            <Collapsible open={desktopCadastrosOpen} onOpenChange={setDesktopCadastrosOpen} className="rounded-xl border border-border/60 bg-background/70">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground">
                <span>Cadastros</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', desktopCadastrosOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 px-2 pb-2">
                {cadastroMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <div className={cn('mb-3 flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
            {!collapsed ? <span className="text-xs text-muted-foreground">Tema</span> : null}
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            title={collapsed ? 'Sair' : undefined}
            className={cn('w-full text-muted-foreground hover:text-destructive', collapsed ? 'justify-center px-3' : 'justify-start gap-3')}
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed ? 'Sair' : null}
          </Button>
        </div>
      </aside>
    </>
  )
}
