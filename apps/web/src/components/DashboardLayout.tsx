import { useEffect, type ReactNode } from "react"
import { Link, useLocation } from "react-router"
import { Collapsible } from "@base-ui/react/collapsible"
import {
  BarChart3, CalendarDays, ChevronDown, ClipboardList, FileText, FolderKanban, Home,
  Import, ListTodo, LogOut, MessageSquareText, Scissors, Settings2, Sparkles,
  Store, Users, UserRound, type LucideIcon,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@workspace/ui/components/sidebar"

type DashboardRole = "owner" | "manager" | "barber"
type NavItem = { label: string; href: string; icon: LucideIcon; subItems?: NavItem[] }
type NavGroup = { label: string; items: NavItem[] }

const crmItems = (root: string, owner: boolean): NavGroup => ({
  label: "Relación con clientes",
  items: [
    { label: "Hoy", href: `${root}#crm`, icon: Sparkles },
    { label: "Clientes", href: `${root}#crm/clientes`, icon: Users },
    { label: "Consultas", href: `${root}#crm/consultas`, icon: MessageSquareText },
    { label: "Seguimientos", href: `${root}#crm/seguimientos`, icon: ListTodo },
    ...(owner ? [{
      label: "Campañas", href: `${root}#crm/campanas`, icon: FolderKanban,
      subItems: [
        { label: "Gestionar campañas", href: `${root}#crm/campanas`, icon: FolderKanban },
        { label: "Promociones", href: `${root}#promociones`, icon: Sparkles },
      ],
    }] : [{ label: "Campañas", href: `${root}#crm/campanas`, icon: FolderKanban }]),
    { label: "Resultados", href: `${root}#crm/resultados`, icon: BarChart3 },
    ...(owner ? [{ label: "Importar CSV", href: `${root}#crm/importar`, icon: Import }] : []),
    { label: "Ajustes CRM", href: `${root}#crm/ajustes`, icon: Settings2 },
  ],
})

function navigation(role: DashboardRole): NavGroup[] {
  if (role === "owner") return [
    { label: "Operación", items: [
      { label: "Resumen", href: "/admin", icon: Home },
      { label: "Citas", href: "/admin#citas", icon: CalendarDays },
      { label: "Comprobantes", href: "/admin#comprobantes", icon: FileText },
    ] },
    crmItems("/admin", true),
    { label: "Administración", items: [
      { label: "Sucursales", href: "/admin#sedes", icon: Store },
      { label: "Equipo", href: "/admin#equipo", icon: UserRound },
      { label: "Servicios", href: "/admin#servicios", icon: Scissors },
    ] },
  ]
  if (role === "manager") return [
    { label: "Sucursal", items: [
      { label: "Resumen", href: "/encargado", icon: Home },
      { label: "Registrar atención", href: "/encargado#registrar", icon: ClipboardList },
      { label: "Comprobantes", href: "/encargado#comprobantes", icon: FileText },
    ] },
    crmItems("/encargado", false),
  ]
  return [{ label: "Mi trabajo", items: [
    { label: "Agenda", href: "/barbero", icon: CalendarDays },
    { label: "Mi horario", href: "/barbero#horario", icon: ClipboardList },
  ] }]
}

function isActive(href: string, current: string) {
  if (href === "/admin#sedes" && current === "/admin#nueva") return true
  if (href === "/encargado#comprobantes" && current.startsWith("/encargado/comprobantes/")) return true
  if (href === current) return true
  return href.includes("#") && !href.endsWith("#crm") && current.startsWith(`${href}/`)
}

interface Props {
  role: DashboardRole
  title: string
  subtitle: string
  userLabel: string
  onHome: () => void
  onSignOut: () => void | Promise<void>
  children: ReactNode
}

export function DashboardLayout(props: Props) {
  return <TooltipProvider><SidebarProvider className="area-shell dashboard-shell" style={{ "--sidebar-width": "252px", "--sidebar-width-icon": "70px" } as React.CSSProperties}>
    <DashboardFrame {...props} />
  </SidebarProvider></TooltipProvider>
}

function DashboardFrame({ role, title, subtitle, userLabel, onHome, onSignOut, children }: Props) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const current = `${location.pathname}${location.hash}`
  const roleLabel = role === "owner" ? "Propietario" : role === "manager" ? "Encargado" : "Barbero"
  const groups = navigation(role)

  useEffect(() => {
    if (!["#registrar", "#comprobantes", "#horario"].includes(location.hash)) return
    const frame = window.requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }))
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash])

  const closeMobile = () => { if (isMobile) setOpenMobile(false) }
  const userInitial = userLabel.trim().slice(0, 1).toUpperCase() || "H"

  return <>
    <Sidebar collapsible="icon" className="dashboard-sidebar">
      <SidebarHeader className="dashboard-sidebar-head">
        <button type="button" className="dashboard-brand" onClick={() => { closeMobile(); onHome() }} title="HOME Barbería">
          <span className="dashboard-brand-mark"><Scissors aria-hidden="true" /></span>
          <span className="dashboard-brand-name"><strong>HOME</strong><small>Barbería · {roleLabel}</small></span>
        </button>
      </SidebarHeader>
      <SidebarContent className="dashboard-nav">
        {groups.map((group) => <SidebarGroup key={group.label} className="dashboard-nav-group">
          <SidebarGroupLabel className="dashboard-nav-label">{group.label}</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {group.items.map(({ label, href, icon: Icon, subItems }) => {
              const itemActive = subItems ? subItems.some((item) => isActive(item.href, current)) : isActive(href, current)
              if (subItems?.length) return <SidebarMenuItem key={href}>
                <Collapsible.Root defaultOpen={itemActive} className="dashboard-campaigns-collapse">
                  <Collapsible.Trigger render={<SidebarMenuButton isActive={itemActive} tooltip={label} />}>
                    <Icon aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" className="dashboard-submenu-chevron" />
                  </Collapsible.Trigger>
                  <Collapsible.Panel className="dashboard-submenu-panel"><SidebarMenuSub>
                    {subItems.map((subItem) => <SidebarMenuSubItem key={subItem.href}>
                      <SidebarMenuSubButton render={<Link to={subItem.href} onClick={closeMobile} aria-current={isActive(subItem.href, current) ? "page" : undefined} />} isActive={isActive(subItem.href, current)}>
                        <subItem.icon aria-hidden="true" /><span>{subItem.label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>)}
                  </SidebarMenuSub></Collapsible.Panel>
                </Collapsible.Root>
              </SidebarMenuItem>
              return <SidebarMenuItem key={href}>
                <SidebarMenuButton render={<Link to={href} onClick={closeMobile} aria-current={itemActive ? "page" : undefined} />} isActive={itemActive} tooltip={label}>
                  <Icon aria-hidden="true" /><span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            })}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>)}
      </SidebarContent>
      <SidebarFooter className="dashboard-sidebar-foot">
        <div className="dashboard-person"><span className="dashboard-person-mark">{userInitial}</span><span className="dashboard-person-label"><strong>{userLabel}</strong><small>{roleLabel}</small></span></div>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton render={<button type="button" onClick={() => { closeMobile(); onHome() }} />} tooltip="Ver sitio"><Home aria-hidden="true" /><span>Ver sitio</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton render={<button type="button" onClick={() => void onSignOut()} />} tooltip="Cerrar sesión"><LogOut aria-hidden="true" /><span>Cerrar sesión</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className="dashboard-inset">
      <header className="dashboard-topbar">
        <SidebarTrigger className="dashboard-trigger" aria-label="Mostrar u ocultar menú" />
        <Separator orientation="vertical" className="dashboard-topbar-separator" />
        <span className="dashboard-crumb">HOME <span>/</span> {roleLabel} <span>/</span> <strong>{title}</strong></span>
        <span className="dashboard-topbar-role">{roleLabel}</span>
        <Button variant="ghost" size="sm" className="dashboard-signout" onClick={() => void onSignOut()}>Salir</Button>
      </header>
      <div className="area-main dashboard-main"><div className="area-title dashboard-title"><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>
    </SidebarInset>
  </>
}
