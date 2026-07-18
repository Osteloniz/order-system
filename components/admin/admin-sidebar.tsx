'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Archive, ArrowDownCircle, ArrowUpCircle, BarChart3, BadgePercent, ChevronDown, ChevronLeft, ClipboardList, FileClock, Landmark, LayoutPanelTop, LogOut, Menu, Package, Settings, Store, Tags, Users, X, type LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { cn } from '@/lib/utils'

const coreMenuItems = [
  { href: '/admin', label: 'Pedidos', icon: ClipboardList },
  { href: '/admin/kds', label: 'KDS operacional', icon: LayoutPanelTop },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
]

const operationalMenuItems = [
  { href: '/admin/relatorios', label: 'Relatorios', icon: BarChart3 },
  { href: '/admin/financeiro/contas-receber', label: 'Contas a receber', icon: ArrowUpCircle },
  { href: '/admin/financeiro/fluxo-caixa', label: 'Fluxo de caixa', icon: Landmark },
  { href: '/admin/financeiro/contas-pagar', label: 'Contas a pagar', icon: ArrowDownCircle },
  { href: '/admin/logs', label: 'Logs', icon: FileClock },
]

const cadastroMenuItems = [
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias de produtos', icon: Tags },
  { href: '/admin/categorias-financeiras', label: 'Categorias financeiras', icon: Landmark },
  { href: '/admin/cupons', label: 'Cupons', icon: BadgePercent },
  { href: '/admin/estoque', label: 'Estoque e producao', icon: Archive },
]

const settingsMenuItem = { href: '/admin/config', label: 'Configuracoes', icon: Settings }

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed = false,
  onClick,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  collapsed?: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-3 py-3' : 'gap-3 px-4 py-3',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed ? label : null}
    </Link>
  )
}

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
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const cadastrosActive = cadastroMenuItems.some((item) => isActive(item.href))

  useEffect(() => {
    if (cadastrosActive) {
      setDesktopCadastrosOpen(true)
      setMobileCadastrosOpen(true)
    }
  }, [cadastrosActive])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 flex min-h-14 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen((current) => !current)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-primary">
            <Store className="h-5 w-5 shrink-0" />
            <span className="truncate font-bold">{tenantNome}</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 pt-[calc(env(safe-area-inset-top)+3.5rem)] backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <nav
            className="h-full w-[min(19rem,88vw)] space-y-3 overflow-y-auto border-r border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center gap-3 text-primary">
                <Store className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{tenantNome}</p>
                  <p className="text-xs text-muted-foreground">Navegacao principal</p>
                </div>
              </div>
            </div>

            {coreMenuItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                onClick={() => setMobileOpen(false)}
              />
            ))}

            <Collapsible open={mobileCadastrosOpen} onOpenChange={setMobileCadastrosOpen} className="rounded-lg border border-border/60 bg-background/70">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                <span>Cadastros</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', mobileCadastrosOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 px-2 pb-2">
                {cadastroMenuItems.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(item.href)}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>

            {operationalMenuItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                onClick={() => setMobileOpen(false)}
              />
            ))}

            <SidebarLink
              href={settingsMenuItem.href}
              label={settingsMenuItem.label}
              icon={settingsMenuItem.icon}
              active={isActive(settingsMenuItem.href)}
              onClick={() => setMobileOpen(false)}
            />

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
          {coreMenuItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}

          {collapsed ? (
            <div className="space-y-2 pt-2">
              {cadastroMenuItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(item.href)}
                  collapsed
                />
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
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(item.href)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {operationalMenuItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}

          <SidebarLink
            href={settingsMenuItem.href}
            label={settingsMenuItem.label}
            icon={settingsMenuItem.icon}
            active={isActive(settingsMenuItem.href)}
            collapsed={collapsed}
          />
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
