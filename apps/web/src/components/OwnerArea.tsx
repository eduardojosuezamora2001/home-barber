import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { toast } from "sonner"
import { displayDate, displayTime } from "../lib/booking"
import { api } from "../lib/api"
import { loadOwnerDashboard } from "../lib/data"
import type { Appointment, Coupon, LoyaltyAccount, ManagerAssignment, Profile, Promotion, PublicData, Referral, SessionUser } from "../lib/types"
import { DashboardLayout } from "./DashboardLayout"
import { AreaSkeleton } from "./LoadingSkeleton"

const OwnerAppointments = lazy(() => import("./OwnerAppointments").then((module) => ({ default: module.OwnerAppointments })))
const OwnerPromotions = lazy(() => import("./OwnerPromotions").then((module) => ({ default: module.OwnerPromotions })))
const OwnerSettings = lazy(() => import("./OwnerSettings").then((module) => ({ default: module.OwnerSettings })))
const NewBranchPage = lazy(() => import("./NewBranchPage").then((module) => ({ default: module.NewBranchPage })))
const OwnerReceipts = lazy(() => import("./OwnerReceipts").then((module) => ({ default: module.OwnerReceipts })))
const CrmWorkspace = lazy(() => import("./crm/CrmWorkspace").then((module) => ({ default: module.CrmWorkspace })))

interface Props { data: PublicData | null; user: SessionUser; profile: Profile | null; onHome: () => void; onSignOut: () => void | Promise<void>; onRefresh: () => void | Promise<void> }

const adminPaths: Record<string, string> = {
  resumen: "/admin", citas: "/admin#citas", promociones: "/admin#promociones",
  sedes: "/admin#sedes", nueva: "/admin#nueva",
  equipo: "/admin#equipo", comprobantes: "/admin#comprobantes", servicios: "/admin#servicios",
}

export function OwnerArea({ data: publicData, user, profile, onHome, onSignOut, onRefresh }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [managers, setManagers] = useState<ManagerAssignment[]>([])
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<LoyaltyAccount[]>([])
  const [ownerCatalog, setOwnerCatalog] = useState<PublicData | null>(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const data = ownerCatalog ?? publicData
  const section = location.hash.slice(1)
  const crmOpen = section === "crm" || section.startsWith("crm/")
  const teamPath = section.startsWith("equipo/") ? decodeURIComponent(section.slice("equipo/".length)) : null
  const managerId = teamPath?.startsWith("encargado/") ? teamPath.slice("encargado/".length) : null
  const employeeId = managerId ? null : teamPath
  const newReceipt = section === "comprobantes/nuevo"
  const receiptId = section.startsWith("comprobantes/") && !newReceipt ? section.slice("comprobantes/".length) : null
  const tab = teamPath ? "equipo" : receiptId || newReceipt ? "comprobantes" : section === "nueva" ? "nueva" : section === "sedes" ? "sedes" : Object.entries(adminPaths).find(([, path]) => path === `${location.pathname}${location.hash}`)?.[0] ?? "resumen"
  const employee = data?.barbers.find((item) => item.id === employeeId)
  const manager = profiles.find((item) => item.id === managerId)
  const title = crmOpen ? "CRM" : managerId ? manager?.full_name || manager?.email || "Encargado" : employeeId ? employee?.display_name ?? "Empleado" : receiptId ? "Comprobante interno" : newReceipt ? "Nuevo comprobante" : tab === "nueva" ? "Nueva sucursal" : tab === "equipo" ? "Equipo" : tab === "comprobantes" ? "Comprobantes" : tab === "sedes" ? "Sucursales" : tab === "servicios" ? "Servicios" : "Panel del propietario"
  const selectTab = (value: string) => {
    navigate(adminPaths[value] ?? "/admin")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const refresh = useCallback(async () => {
    try {
      const dashboard = await loadOwnerDashboard()
      setAppointments(dashboard.appointments)
      setPromotions(dashboard.promotions)
      setReferrals(dashboard.referrals)
      setCoupons(dashboard.coupons)
      setProfiles(dashboard.profiles)
      setManagers(dashboard.managers)
      setLoyaltyAccounts(dashboard.loyaltyAccounts)
      setOwnerCatalog(dashboard.catalog)
      setMessage("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el panel.")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh, user.id])

  const funnel = useMemo(() => {
    const total = appointments.length
    const confirmed = appointments.filter((item) => item.status === "confirmed" || item.status === "completed").length
    const completed = appointments.filter((item) => item.status === "completed").length
    const pending = appointments.filter((item) => item.status === "pending").length
    return { total, confirmed, completed, pending }
  }, [appointments])

  async function changeStatus(id: string, status: Appointment["status"]) {
    try { await api.patch(`/appointments/${id}/status`, { status }); await Promise.all([refresh(), onRefresh()]); toast.success(status === "completed" ? "Cita completada y puntos acreditados." : "Cita actualizada.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo actualizar la cita.") }
  }

  if (loading) return <AreaSkeleton />

  return <DashboardLayout role="owner" title={title} subtitle={crmOpen ? "Relaciones que se convierten en próximas visitas." : `Operación y crecimiento de HOME${profile?.full_name ? ` · ${profile.full_name}` : ""}.`} userLabel={profile?.full_name || user.email || "Propietario"} onHome={onHome} onSignOut={onSignOut}>
    {message && <p role="status" className="area-message">{message}</p>}
    {crmOpen ? <Suspense fallback={<AreaSkeleton />}><CrmWorkspace role="owner" branches={data?.branches} /></Suspense> : <div className="owner-content">
      {tab === "resumen" && <><section className="metrics-strip" aria-label="Embudo de citas registradas"><div><span>Consultas registradas</span><strong>{funnel.total}</strong></div><div><span>Por confirmar</span><strong>{funnel.pending}</strong></div><div><span>Confirmadas</span><strong>{funnel.confirmed}</strong></div><div><span>Atendidas</span><strong>{funnel.completed}</strong></div></section><div className="area-columns"><section><h2>Lo que necesita atención</h2>{funnel.pending ? <div className="area-list">{appointments.filter((item) => item.status === "pending").slice(0, 5).map((item) => <Card key={item.id}><CardHeader><CardTitle>{item.customer_name}</CardTitle><CardDescription>{data?.services.find((service) => service.id === item.service_id)?.name ?? "Servicio"} · {data?.branches.find((branch) => branch.id === item.branch_id)?.name ?? "Sucursal"}</CardDescription></CardHeader><CardContent><div className="appointment-line"><span>{displayDate(item.requested_at.slice(0,10))} · {displayTime(item.requested_at)}</span><Button size="sm" onClick={() => { selectTab("citas") }}>Revisar</Button></div></CardContent></Card>)}</div> : <div className="empty-state">No hay consultas pendientes. Las nuevas solicitudes de usuarios con cuenta aparecerán aquí.</div>}</section><section><h2>Lectura del negocio</h2><div className="insight-panel"><p>Este embudo cuenta solo las solicitudes registradas en HOME. Las consultas de invitados que llegan directo a WhatsApp se coordinan allí y no aparecen en estas cifras.</p><div><span>Solicitudes que llegan a confirmarse</span><strong>{funnel.total ? `${Math.round((funnel.confirmed / funnel.total) * 100)} %` : "Sin datos"}</strong></div><p>El siguiente paso es comparar citas confirmadas con citas realmente atendidas y vigilar las cancelaciones.</p></div></section></div><RetentionPanel accounts={loyaltyAccounts} coupons={coupons} /></>}
      {tab === "citas" && <><Suspense fallback={<AreaSkeleton />}><OwnerAppointments appointments={appointments} data={data} profiles={profiles} onStatus={changeStatus} /></Suspense></>}
      {tab === "promociones" && <><Suspense fallback={<AreaSkeleton />}><OwnerPromotions data={data} promotions={promotions} coupons={coupons} referrals={referrals} profiles={profiles} onRefresh={refresh} /></Suspense></>}
      {tab === "sedes" && <Suspense fallback={<AreaSkeleton />}><OwnerSettings section="sedes" data={data} profiles={profiles} managers={managers} ownerId={user.id} onRefresh={async () => { await onRefresh(); await refresh() }} /></Suspense>}
      {tab === "nueva" && <Suspense fallback={<AreaSkeleton />}><NewBranchPage onCreated={async (id) => { await onRefresh(); await refresh(); navigate(`/admin?branch=${encodeURIComponent(id)}#sedes`); toast.success("Sucursal creada. Configura sus horarios antes de activarla.") }} onMessage={(error) => toast.error(error)} /></Suspense>}
      {tab === "equipo" && <Suspense fallback={<AreaSkeleton />}><OwnerSettings section="equipo" employeeId={employeeId} managerId={managerId} data={data} profiles={profiles} managers={managers} ownerId={user.id} onRefresh={async () => { await onRefresh(); await refresh() }} /></Suspense>}
      {tab === "comprobantes" && <Suspense fallback={<AreaSkeleton />}><OwnerReceipts data={data} appointments={appointments} onCreated={refresh} /></Suspense>}
      {tab === "servicios" && <Suspense fallback={<AreaSkeleton />}><OwnerSettings section="servicios" data={data} profiles={profiles} managers={managers} ownerId={user.id} onRefresh={async () => { await onRefresh(); await refresh() }} /></Suspense>}
    </div>}
  </DashboardLayout>
}

function RetentionPanel({ accounts, coupons }: { accounts: LoyaltyAccount[]; coupons: Coupon[] }) {
  const served = accounts.filter((account) => account.visits > 0).length
  const returning = accounts.filter((account) => account.visits > 1).length
  const redeemed = coupons.filter((coupon) => coupon.status === "redeemed").length
  return <section className="retention-panel" aria-label="Fidelización"><div><h2>Clientes que vuelven</h2><p>Solo contamos a quienes tienen citas marcadas como atendidas en HOME.</p></div><div><strong>{served ? `${Math.round(returning / served * 100)} %` : "—"}</strong><span>{returning} de {served} clientes atendidos regresaron</span></div><div><strong>{coupons.length ? `${Math.round(redeemed / coupons.length * 100)} %` : "—"}</strong><span>{redeemed} de {coupons.length} cupones reclamados se canjearon</span></div></section>
}
