import { Eye } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import type { Appointment, PublicData } from "../lib/types"

const statuses: Record<Appointment["status"], string> = { pending: "Por confirmar", confirmed: "Confirmada", completed: "Atendida", cancelled: "Cancelada" }
const dateTime = new Intl.DateTimeFormat("es-CR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Costa_Rica" })

export function AppointmentDetails({ appointment, data, email, contactClient = false }: { appointment: Appointment; data: PublicData | null; email?: string | null; contactClient?: boolean }) {
  const service = data?.services.find((item) => item.id === appointment.service_id)
  const branch = data?.branches.find((item) => item.id === appointment.branch_id)
  const barber = data?.barbers.find((item) => item.id === appointment.barber_id)
  const duration = Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.requested_at)) / 60000)
  const phone = appointment.customer_whatsapp.replace(/\D/g, "")
  return <Dialog>
    <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}><Eye data-icon="inline-start" />Ver detalle</DialogTrigger>
    <DialogContent className="appointment-detail-dialog">
      <DialogHeader><DialogTitle>Detalle de la cita</DialogTitle><DialogDescription>{service?.name ?? "Servicio"} · {branch?.name ?? "Sucursal"}</DialogDescription></DialogHeader>
      <Badge variant="secondary" className="w-fit">{statuses[appointment.status]}</Badge>
      <dl className="appointment-details">
        <div><dt>Cliente</dt><dd>{appointment.customer_name}</dd></div>
        <div><dt>WhatsApp</dt><dd>{appointment.customer_whatsapp}</dd></div>
        {email && <div><dt>Correo del cliente</dt><dd>{email}</dd></div>}
        <div><dt>Inicio</dt><dd>{dateTime.format(new Date(appointment.requested_at))}</dd></div>
        <div><dt>Finalización</dt><dd>{dateTime.format(new Date(appointment.ends_at))}</dd></div>
        <div><dt>Duración reservada</dt><dd>{duration} minutos</dd></div>
        <div><dt>Servicio</dt><dd>{service?.name ?? "Servicio"}</dd></div>
        <div><dt>Barbero</dt><dd>{barber?.display_name ?? "Barbero"}</dd></div>
        <div><dt>Sucursal</dt><dd>{branch?.name ?? "Sucursal"}{branch?.address ? ` · ${branch.address}` : ""}</dd></div>
        <div><dt>Solicitud recibida</dt><dd>{dateTime.format(new Date(appointment.created_at))}</dd></div>
        <div className="appointment-details-wide"><dt>Notas del cliente</dt><dd className="appointment-details-notes">{appointment.notes || "Sin notas adicionales."}</dd></div>
        <div className="appointment-details-wide"><dt>Referencia</dt><dd>{appointment.id}</dd></div>
      </dl>
      {contactClient && /^[0-9]{8,15}$/.test(phone) && <DialogFooter><a href={`https://wa.me/${phone.length === 8 ? `506${phone}` : phone}`} target="_blank" rel="noreferrer">Contactar por WhatsApp ↗</a></DialogFooter>}
    </DialogContent>
  </Dialog>
}
