'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  CirclePlus,
  ClipboardList,
  ExternalLink,
  FileClock,
  Home,
  Landmark,
  LayoutPanelTop,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAdminAuth } from '@/contexts/admin-auth-context'
import { cn } from '@/lib/utils'

type MenuItem = { href: string; label: string; icon: LucideIcon }

const operationItems: MenuItem[] = [
  { href: '/admin/inicio', label: 'Início', icon: Home },
  { href: '/admin', label: 'Pedidos', icon: ClipboardList },
  { href: '/admin/novo-pedido', label: 'Nova venda', icon: CirclePlus },
  { href: '/admin/kds', label: 'KDS operacional', icon: LayoutPanelTop },
]

const catalogItems: MenuItem[] = [
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias', icon: Tags },
  { href: '/admin/cupons', label: 'Cupons', icon: BadgePercent },
  { href: '/admin/estoque', label: 'Estoque e produção', icon: Archive },
]

const financeItems: MenuItem[] = [
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/admin/financeiro/contas-receber', label: 'Contas a receber', icon: ArrowUpCircle },
  { href: '/admin/financeiro/fluxo-caixa', label: 'Fluxo de caixa', icon: Landmark },
  { href: '/admin/financeiro/contas-pagar', label: 'Contas a pagar', icon: ArrowDownCircle },
  { href: '/admin/categorias-financeiras', label: 'Categorias financeiras', icon: Landmark },
]

const managementItems: MenuItem[] = [
  { href: '/admin/seguranca', label: 'Seguranca e acessos', icon: ShieldCheck },
  { href: '/admin/config', label: 'Configurações', icon: Settings },
  { href: '/admin/logs', label: 'Logs', icon: FileClock },
]

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-full border border-[#E7DBB3] bg-[#E7DBB3] shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image src="/brand/brookie-mark-color.jpg" alt="" fill sizes={`${size}px`} className="object-cover" />
    </span>
  )
}

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
        'flex h-9 items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  )
}

function MenuSection({
  label,
  items,
  open,
  onOpenChange,
  isActive,
  onNavigate,
}: {
  label: string
  items: MenuItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  isActive: (href: string) => boolean
  onNavigate?: () => void
}) {
  const hasActiveItem = items.some((item) => isActive(item.href))

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border border-border/60 bg-background/55">
      <CollapsibleTrigger className="flex h-9 w-full items-center justify-between px-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {hasActiveItem ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 px-1.5 pb-1.5">
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
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
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false)
  const [mobileFinanceOpen, setMobileFinanceOpen] = useState(false)
  const [mobileManagementOpen, setMobileManagementOpen] = useState(false)
  const [desktopCatalogOpen, setDesktopCatalogOpen] = useState(true)
  const [desktopFinanceOpen, setDesktopFinanceOpen] = useState(false)
  const [desktopManagementOpen, setDesktopManagementOpen] = useState(false)
  const { data: tenantData } = useSWR('/api/admin/tenant', fetcher)
  const tenantNome = tenantData?.nome ?? 'Brookie Pregiato'

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const catalogActive = catalogItems.some((item) => isActive(item.href))
  const financeActive = financeItems.some((item) => isActive(item.href))
  const managementActive = managementItems.some((item) => isActive(item.href))

  useEffect(() => {
    if (catalogActive) {
      setMobileCatalogOpen(true)
      setDesktopCatalogOpen(true)
    }
    if (financeActive) {
      setMobileFinanceOpen(true)
      setDesktopFinanceOpen(true)
    }
    if (managementActive) {
      setMobileManagementOpen(true)
      setDesktopManagementOpen(true)
    }
  }, [catalogActive, financeActive, managementActive])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const mobileClose = () => setMobileOpen(false)
  const allSecondaryItems = [...catalogItems, ...financeItems, ...managementItems]

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 flex min-h-12 items-center justify-between border-b border-border bg-card/95 px-2.5 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMobileOpen((current) => !current)}>
            {mobileOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </Button>
          <Link href="/admin/inicio" className="flex min-w-0 items-center gap-2" onClick={mobileClose}>
            <BrandMark size={28} />
            <span className="truncate text-sm font-bold text-primary">{tenantNome}</span>
          </Link>
        </div>
        <ThemeToggle />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-foreground/20 pt-[calc(env(safe-area-inset-top)+3rem)] backdrop-blur-[2px] md:hidden" onClick={mobileClose}>
          <nav
            aria-label="Navegação administrativa"
            className="flex h-full w-[min(18rem,88vw)] flex-col border-r border-border bg-card shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border/70 p-3">
              <BrandMark size={46} />
              <div className="min-w-0">
                <p className="truncate font-bold text-primary">{tenantNome}</p>
                <p className="text-xs text-muted-foreground">Central de operação</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              <div className="space-y-0.5">
                {operationItems.map((item) => (
                  <SidebarLink key={item.href} {...item} active={isActive(item.href)} onClick={mobileClose} />
                ))}
              </div>

              <MenuSection label="Cadastros" items={catalogItems} open={mobileCatalogOpen} onOpenChange={setMobileCatalogOpen} isActive={isActive} onNavigate={mobileClose} />
              <MenuSection label="Financeiro" items={financeItems} open={mobileFinanceOpen} onOpenChange={setMobileFinanceOpen} isActive={isActive} onNavigate={mobileClose} />
              <MenuSection label="Gestão" items={managementItems} open={mobileManagementOpen} onOpenChange={setMobileManagementOpen} isActive={isActive} onNavigate={mobileClose} />
            </div>

            <div className="space-y-1 border-t border-border p-2.5 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              <Link href="/menu" target="_blank" className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ExternalLink className="h-4 w-4" />Ver cardápio público
              </Link>
              <Button variant="ghost" className="h-9 w-full justify-start gap-2.5 px-3 text-muted-foreground hover:text-destructive" onClick={logout}>
                <LogOut className="h-4 w-4" />Sair
              </Button>
            </div>
          </nav>
        </div>
      ) : null}

      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className={cn('flex h-16 items-center border-b border-border p-2.5', collapsed ? 'justify-center' : 'justify-between')}>
          <Link href="/admin/inicio" className={cn('flex min-w-0 items-center gap-2', collapsed && 'justify-center')}>
            <BrandMark size={collapsed ? 36 : 40} />
            {!collapsed ? <div className="min-w-0"><p className="truncate text-sm font-bold text-primary">{tenantNome}</p><p className="text-[10px] text-muted-foreground">Cookies artesanais</p></div> : null}
          </Link>
          {!collapsed ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Recolher menu" onClick={onToggleCollapsed}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5" aria-label="Navegação administrativa">
          {operationItems.map((item) => (
            <SidebarLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}

          {collapsed ? (
            <div className="space-y-0.5 border-t border-border/60 pt-1.5">
              {allSecondaryItems.map((item) => <SidebarLink key={item.href} {...item} active={isActive(item.href)} collapsed />)}
            </div>
          ) : (
            <div className="space-y-1.5 border-t border-border/60 pt-1.5">
              <MenuSection label="Cadastros" items={catalogItems} open={desktopCatalogOpen} onOpenChange={setDesktopCatalogOpen} isActive={isActive} />
              <MenuSection label="Financeiro" items={financeItems} open={desktopFinanceOpen} onOpenChange={setDesktopFinanceOpen} isActive={isActive} />
              <MenuSection label="Gestão" items={managementItems} open={desktopManagementOpen} onOpenChange={setDesktopManagementOpen} isActive={isActive} />
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-border p-2.5">
          {collapsed ? (
            <Button variant="ghost" size="icon" className="mb-1 h-9 w-full" aria-label="Expandir menu" onClick={onToggleCollapsed}><ChevronLeft className="h-4 w-4 rotate-180" /></Button>
          ) : (
            <div className="mb-1 flex items-center justify-between px-2"><span className="text-xs text-muted-foreground">Tema</span><ThemeToggle /></div>
          )}
          <Button variant="ghost" title={collapsed ? 'Sair' : undefined} className={cn('h-9 w-full text-muted-foreground hover:text-destructive', collapsed ? 'justify-center px-2' : 'justify-start gap-2.5 px-3')} onClick={logout}>
            <LogOut className="h-4 w-4" />{!collapsed ? 'Sair' : null}
          </Button>
        </div>
      </aside>
    </>
  )
}
