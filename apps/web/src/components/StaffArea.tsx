import { useCallback, useEffect, useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { displayDate, displayTime, shortTime, WEEKDAYS } from "../lib/booking"
import { api } from "../lib/api"
import { loadStaffDashboard } from "../lib/data"
import type { Appointment, Profile, PublicData, SessionUser } from "../lib/types"
import { AppointmentDetails } from "./AppointmentDetails"
import { DashboardLayout } from "./DashboardLayout"
import { AreaSkeleton } from "./LoadingSkeleton"

interface Props { data: PublicData | null; user: SessionUser; profile: Profile | null; onHome: () => void; onSignOut: () => void | Promise<void>; onRefresh: () => void | Promise<void> }

export function StaffArea({ data, user, profile, onHome, onSignOut, onRefresh }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const barber = data?.barbers.find((item) => item.user_id === user.id)
  const shifts = data?.barberHours.filter((item) => item.barber_id === barber?.id) ?? []

  const refresh = useCallback(async () => {
    try { setAppointments((await loadStaffDashboard()).appointments) }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar la agenda.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh, user.id])

  async function changeStatus(id: string, status: Appointment["status"]) {
    try { await api.patch(`/appointments/${id}/status`, { status }); setMessage(status === "completed" ? "Cita completada. Se sumaron los puntos del cliente." : "Estado actualizado."); await Promise.all([refresh(), onRefresh()]) }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo actualizar la cita.") }
  }

  if (loading) return <AreaSkeleton />

  return <DashboardLayout role="barber" title="Mi agenda" subtitle={`Las consultas asignadas a ${barber?.display_name ?? profile?.full_name ?? "tu perfil"}.`} userLabel={profile?.full_name || user.email || "Barbero"} onHome={onHome} onSignOut={onSignOut}>
    {message && <p role="status" className="area-message">{message}</p>}
    {!barber && <div className="empty-state">Tu cuenta tiene rol de barbero, pero aún no está vinculada a un perfil del equipo. El propietario puede hacerlo desde su panel.</div>}
    <div className="area-columns"><section><h2>Solicitudes y citas</h2>{appointments.length ? <div className="area-list">{appointments.map((appointment) => <Card key={appointment.id}><CardHeader><CardTitle>{appointment.customer_name}</CardTitle><CardDescription>{data?.services.find((service) => service.id === appointment.service_id)?.name ?? "Servicio"} · {data?.branches.find((branch) => branch.id === appointment.branch_id)?.name ?? "Sucursal"}</CardDescription></CardHeader><CardContent><div className="appointment-line"><span>{displayDate(appointment.requested_at.slice(0, 10))} · {displayTime(appointment.requested_at)}</span><Badge variant="secondary">{appointment.status}</Badge></div><p className="muted-line">WhatsApp: {appointment.customer_whatsapp}</p>{appointment.notes && <p>{appointment.notes}</p>}<div className="row-actions"><AppointmentDetails contactClient appointment={appointment} data={data} />{appointment.status === "pending" && <><Button size="sm" onClick={() => void changeStatus(appointment.id, "confirmed")}>Confirmar</Button><Button size="sm" variant="outline" onClick={() => void changeStatus(appointment.id, "cancelled")}>Cancelar</Button></>}{appointment.status === "confirmed" && <><Button size="sm" onClick={() => void changeStatus(appointment.id, "completed")}>Marcar atendida</Button><Button size="sm" variant="outline" onClick={() => void changeStatus(appointment.id, "cancelled")}>Cancelar</Button></>}</div></CardContent></Card>)}</div> : <div className="empty-state">No hay solicitudes asignadas por ahora.</div>}</section>
    <section id="horario"><h2>Mi horario</h2>{shifts.length ? <div className="shift-list">{WEEKDAYS.map((day, weekday) => { const shift = shifts.find((item) => item.weekday === weekday); if (!shift) return null; return <div key={day}><span>{day} · {data?.branches.find((branch) => branch.id === shift.branch_id)?.name}</span><strong>{shortTime(shift.opens_at)} – {shortTime(shift.closes_at)}</strong></div> })}</div> : <div className="empty-state">No hay turnos cargados para este perfil.</div>}</section></div>
  </DashboardLayout>
}
