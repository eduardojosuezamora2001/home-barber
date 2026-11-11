import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { api } from "../lib/api"
import { loadManagerDashboard } from "../lib/data"
import type { ManagerDashboard, ServiceReceipt, SessionUser } from "../lib/types"
import { DashboardLayout } from "./DashboardLayout"
import { AreaSkeleton } from "./LoadingSkeleton"
import { ReceiptDocument } from "./ReceiptDocument"
import { CrmContactPicker, type CrmContactPickerValue } from "./crm/CrmContactPicker"

interface Props { user: SessionUser; onHome: () => void; onSignOut: () => void | Promise<void> }
const CrmWorkspace = lazy(() => import("./crm/CrmWorkspace").then((module) => ({ default: module.CrmWorkspace })))
interface Item { key: number; serviceId: string; quantity: string; unitPrice: string }
const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(value)
const dateTime = (value: string) => new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(new Date(value))

export function ManagerArea({ user, onHome, onSignOut }: Props) {
  const location = useLocation()
  const crmOpen = location.hash === "#crm" || location.hash.startsWith("#crm/")
  const navigate = useNavigate()
  const receiptId = location.pathname.startsWith("/encargado/comprobantes/") ? location.pathname.slice("/encargado/comprobantes/".length) : null
  const [dashboard, setDashboard] = useState<ManagerDashboard | null>(null)
  const [receipt, setReceipt] = useState<ServiceReceipt | null>(null)
  const [failedReceiptId, setFailedReceiptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<CrmContactPickerValue | null>(null)
  const [barberId, setBarberId] = useState("")
  const [appointmentId, setAppointmentId] = useState("")
  const [items, setItems] = useState<Item[]>([{ key: 1, serviceId: "", quantity: "1", unitPrice: "" }])
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    try { setDashboard(await loadManagerDashboard()) }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cargar la sucursal.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh, user.id])
  useEffect(() => {
    if (!receiptId) return
    void api.get<ServiceReceipt>(`/manager/receipts/${encodeURIComponent(receiptId)}`).then(setReceipt).catch((error) => {
      setReceipt(null)
      setFailedReceiptId(receiptId)
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el comprobante.")
    })
  }, [receiptId])

  const branchBarberIds = new Set(dashboard?.assignments.map((item) => item.barber_id) ?? [])
  const barbers = dashboard?.barbers.filter((barber) => branchBarberIds.has(barber.id)) ?? []
  const activeBarbers = barbers.filter((barber) => barber.active)
  const billedAppointmentIds = new Set(dashboard?.receipts.map((item) => item.appointment_id).filter(Boolean) ?? [])
  const matchingAppointments = dashboard?.appointments.filter((appointment) => (appointment.contact_id === client?.id || (client?.profile_id && appointment.client_id === client.profile_id)) && appointment.barber_id === barberId && !billedAppointmentIds.has(appointment.id)) ?? []
  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0), [items])

  function updateItem(key: number, patch: Partial<Item>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  async function createReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client) { toast.error("Busca y selecciona la cuenta del cliente."); return }
    if (!barberId || !activeBarbers.some((barber) => barber.id === barberId)) { toast.error("Selecciona un empleado de tu sucursal."); return }
    if (matchingAppointments.length && !appointmentId) { toast.error("Vincula la cita de este cliente antes de emitir el comprobante."); return }
    const lines = items.map((item) => ({ serviceId: item.serviceId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) }))
    if (lines.some((item) => !item.serviceId || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) { toast.error("Revisa los servicios, cantidades y precios."); return }
    setSaving(true)
    try {
      const note = String(new FormData(event.currentTarget).get("note") || "").trim()
      const created = await api.post<{ id: string; number: number }>("/manager/receipts", { clientId: client.profile_id, crmContactId: client.id, barberId, appointmentId: appointmentId || null, note, items: lines })
      await refresh()
      toast.success(`Comprobante HOME-I-${String(created.number).padStart(6, "0")} emitido.`)
      navigate(`/encargado/comprobantes/${created.id}`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo emitir el comprobante.") }
    finally { setSaving(false) }
  }

  if (loading) return <AreaSkeleton />
  if (!dashboard) return <DashboardLayout role="manager" title="Sucursal no disponible" subtitle="No se pudo cargar tu sucursal asignada." userLabel={user.email || "Encargado"} onHome={onHome} onSignOut={onSignOut}><Button onClick={() => void refresh()}>Reintentar</Button></DashboardLayout>

  return <DashboardLayout role="manager" title={crmOpen ? "CRM" : receiptId ? "Comprobante interno" : `Sucursal ${dashboard.branch.name}`} subtitle={crmOpen ? "Clientes y seguimientos de tu sucursal." : receiptId ? "Registro de atención y cobro de HOME." : "Atenciones, personal y comprobantes de tu sucursal."} userLabel={user.email || "Encargado"} onHome={onHome} onSignOut={onSignOut}>
    {crmOpen ? <Suspense fallback={<AreaSkeleton />}><CrmWorkspace role="manager" /></Suspense> : receiptId ? receipt?.id === receiptId ? <ReceiptDocument receipt={receipt} backTo="/encargado" /> : failedReceiptId === receiptId ? <div className="empty-state">No se pudo cargar este comprobante. <Link to="/encargado">Volver a la sucursal</Link></div> : <AreaSkeleton /> : <>
      <div className="manager-scope"><div><span>Sucursal asignada</span><strong>{dashboard.branch.name}</strong><small>{dashboard.branch.location_label}</small></div><div><span>Profesionales vinculados</span><strong>{barbers.length}</strong><small>Solo los de esta sucursal</small></div><div><span>Comprobantes registrados</span><strong>{dashboard.receipts.length}</strong><small>Últimos 100 de la sucursal</small></div></div>
      <div className="manager-layout"><section id="registrar"><h2>Registrar atención</h2><p className="section-subtitle">Vincula la cuenta del cliente, quien lo atendió y los servicios realizados.</p>
        <Card><CardHeader><CardTitle>Cliente y profesional</CardTitle><CardDescription>Selecciona una cuenta o un cliente de mostrador de esta sucursal.</CardDescription></CardHeader><CardContent>
          <CrmContactPicker role="manager" branchId={dashboard.branch.id} value={client} onChange={(contact) => { setClient(contact); setAppointmentId("") }} />
          {client && <div className="manager-found-client"><Badge variant="secondary">{client.profile_id ? "Cuenta registrada" : "Cliente de mostrador"}</Badge><strong>{client.full_name || client.email || client.phone}</strong><span>{client.email || client.phone || "Sin correo ni teléfono"}</span></div>}
          <FieldGroup><Field><FieldLabel htmlFor="receipt-barber">Empleado que realizó el servicio</FieldLabel><NativeSelect id="receipt-barber" value={barberId} onChange={(event) => { setBarberId(event.target.value); setAppointmentId("") }} required><NativeSelectOption value="">Seleccionar empleado</NativeSelectOption>{activeBarbers.map((barber) => <NativeSelectOption key={barber.id} value={barber.id}>{barber.display_name}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>
          {client && barberId && <FieldGroup><Field><FieldLabel htmlFor="receipt-appointment">Cita relacionada</FieldLabel><NativeSelect id="receipt-appointment" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} required={matchingAppointments.length > 0}><NativeSelectOption value="">{matchingAppointments.length ? "Selecciona la cita correspondiente" : "Atención sin cita previa"}</NativeSelectOption>{matchingAppointments.map((appointment) => <NativeSelectOption key={appointment.id} value={appointment.id}>{dateTime(appointment.requested_at)} · {appointment.status === "completed" ? "Atendida" : "Confirmada"}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>}
        </CardContent></Card>
        <form onSubmit={createReceipt} className="manager-receipt-form"><Card><CardHeader><CardTitle>Servicios y precios</CardTitle><CardDescription>Los importes quedan guardados en este comprobante aunque el catálogo cambie después.</CardDescription></CardHeader><CardContent><FieldGroup>
          {items.map((item, index) => <div className="manager-service-row" key={item.key}><Field><FieldLabel htmlFor={`receipt-service-${item.key}`}>Servicio {index + 1}</FieldLabel><NativeSelect id={`receipt-service-${item.key}`} value={item.serviceId} onChange={(event) => { const selected = dashboard.services.find((service) => service.id === event.target.value); updateItem(item.key, { serviceId: event.target.value, unitPrice: selected?.price == null ? "" : String(selected.price) }) }} required><NativeSelectOption value="">Seleccionar servicio</NativeSelectOption>{dashboard.services.map((service) => <NativeSelectOption key={service.id} value={service.id}>{service.name}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor={`receipt-quantity-${item.key}`}>Cantidad</FieldLabel><Input id={`receipt-quantity-${item.key}`} type="number" min="1" max="10" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} required /></Field><Field><FieldLabel htmlFor={`receipt-price-${item.key}`}>Precio ₡</FieldLabel><Input id={`receipt-price-${item.key}`} type="number" min="0" max="1000000" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })} required /></Field><Button type="button" size="icon" variant="ghost" aria-label={`Quitar servicio ${index + 1}`} disabled={items.length === 1} onClick={() => setItems((current) => current.filter((line) => line.key !== item.key))}><Trash2 /></Button></div>)}
          <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, { key: Math.max(...current.map((line) => line.key)) + 1, serviceId: "", quantity: "1", unitPrice: "" }])} disabled={items.length >= 12}><Plus data-icon="inline-start" />Añadir servicio</Button>
          <Field><FieldLabel htmlFor="receipt-note">Nota interna</FieldLabel><Textarea id="receipt-note" name="note" rows={2} maxLength={500} placeholder="Opcional" /></Field>
          <div className="manager-total"><span>Total del comprobante</span><strong>{money(total)}</strong></div><Button type="submit" disabled={saving || !client || !activeBarbers.length}>{saving ? "Emitiendo…" : "Emitir comprobante interno"}</Button>
        </FieldGroup></CardContent></Card></form>
      </section><aside><h2>Equipo de esta sucursal</h2><div className="manager-team-list">{barbers.map((barber) => <div key={barber.id}><strong>{barber.display_name}</strong><span>{barber.specialty || "Barbero"}</span><Badge variant="secondary">{barber.active ? "Activo" : "Oculto"}</Badge></div>)}{!barbers.length && <div className="empty-state">No hay empleados vinculados. Pide al propietario que asigne el equipo de esta sucursal.</div>}</div><h2 id="comprobantes" className="stacked-heading">Comprobantes recientes</h2><div className="manager-receipt-list">{dashboard.receipts.map((item) => <Link key={item.id} to={`/encargado/comprobantes/${item.id}`}><span><strong>HOME-I-{String(item.number).padStart(6, "0")}</strong><small>{item.client_name} · {item.barber_name}</small></span><span>{money(Number(item.total))}</span></Link>)}{!dashboard.receipts.length && <div className="empty-state">Todavía no hay comprobantes emitidos en esta sucursal.</div>}</div></aside></div>
    </>}
  </DashboardLayout>
}
