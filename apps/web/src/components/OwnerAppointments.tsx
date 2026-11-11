import { useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { displayTime } from "../lib/booking"
import { rewardDate } from "../lib/loyalty"
import { matchesSearch, useCollectionState, withinDates } from "../lib/collections"
import type { Appointment, Profile, PublicData } from "../lib/types"
import { CollectionControls, CollectionPagination } from "./CollectionControls"
import { FilterCombobox } from "./FilterCombobox"
import { AppointmentDetails } from "./AppointmentDetails"

const statuses: Record<Appointment["status"], string> = { pending: "Por confirmar", confirmed: "Confirmada", completed: "Atendida", cancelled: "Cancelada" }

export function OwnerAppointments({ appointments, data, profiles = [], onStatus }: { appointments: Appointment[]; data: PublicData | null; profiles?: Profile[]; onStatus: (id: string, status: Appointment["status"]) => Promise<void> }) {
  const filters = useCollectionState("citas")
  const [working, setWorking] = useState("")
  const branches = new Map(data?.branches.map((item) => [item.id, item.name]))
  const barbers = new Map(data?.barbers.map((item) => [item.id, item.display_name]))
  const services = new Map(data?.services.map((item) => [item.id, item.name]))
  const filtered = appointments.filter((item) =>
    matchesSearch(filters.get("q"), item.customer_name, item.customer_whatsapp, services.get(item.service_id), barbers.get(item.barber_id), branches.get(item.branch_id)) &&
    (!filters.get("status") || item.status === filters.get("status")) &&
    (!filters.get("branch") || item.branch_id === filters.get("branch")) &&
    (!filters.get("barber") || item.barber_id === filters.get("barber")) &&
    withinDates(item.requested_at, filters.get("from"), filters.get("to"))
  ).sort((a, b) => filters.get("sort") === "oldest" ? Date.parse(a.requested_at) - Date.parse(b.requested_at) : filters.get("sort") === "name" ? a.customer_name.localeCompare(b.customer_name, "es-CR") : Date.parse(b.requested_at) - Date.parse(a.requested_at))
  const page = filters.paginate(filtered)

  async function change(id: string, status: Appointment["status"]) {
    setWorking(id)
    try { await onStatus(id, status) } finally { setWorking("") }
  }

  return <section>
    <div className="panel-heading"><h2>Solicitudes de cita</h2><span>{appointments.length} en total</span></div>
    <CollectionControls state={filters} searchLabel="Buscar cliente, servicio o barbero" sorts={[{ value: "newest", label: "Más recientes" }, { value: "oldest", label: "Más antiguas" }, { value: "name", label: "Nombre del cliente" }]}>
      <Field><FieldLabel htmlFor="citas-status">Estado</FieldLabel><NativeSelect id="citas-status" value={filters.get("status")} onChange={(event) => filters.update("status", event.target.value)}><NativeSelectOption value="">Todos los estados</NativeSelectOption>{Object.entries(statuses).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="citas-branch">Sucursal</FieldLabel><FilterCombobox id="citas-branch" value={filters.get("branch")} onChange={(value) => filters.update("branch", value)} options={[{ value: "", label: "Todas las sucursales" }, ...(data?.branches.map((branch) => ({ value: branch.id, label: branch.name })) ?? [])]} placeholder="Buscar sucursal…" emptyLabel="No se encontraron sucursales." /></Field>
      <Field><FieldLabel htmlFor="citas-barber">Barbero</FieldLabel><FilterCombobox id="citas-barber" value={filters.get("barber")} onChange={(value) => filters.update("barber", value)} options={[{ value: "", label: "Todos los barberos" }, ...(data?.barbers.map((barber) => ({ value: barber.id, label: barber.display_name })) ?? [])]} placeholder="Buscar barbero…" emptyLabel="No se encontraron barberos." /></Field>
      <Field><FieldLabel htmlFor="citas-from">Desde</FieldLabel><Input id="citas-from" type="date" max={filters.get("to") || undefined} value={filters.get("from")} onChange={(event) => filters.update("from", event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="citas-to">Hasta</FieldLabel><Input id="citas-to" type="date" min={filters.get("from") || undefined} value={filters.get("to")} onChange={(event) => filters.update("to", event.target.value)} /></Field>
    </CollectionControls>
    {page.items.length ? <div className="collection-results" data-layout={filters.layout}>{page.items.map((item) => <article className="collection-item" key={item.id}>
      <div className="collection-item-main"><h3>{item.customer_name}</h3><p>{services.get(item.service_id) ?? "Servicio"} · {barbers.get(item.barber_id) ?? "Barbero"}</p><p className="muted-line">{branches.get(item.branch_id) ?? "Sucursal"} · WhatsApp: {item.customer_whatsapp}</p>{item.notes && <p className="collection-note">{item.notes}</p>}</div>
      <div className="collection-item-meta"><Badge variant="secondary">{statuses[item.status]}</Badge><span>{rewardDate(item.requested_at)}</span><span>{displayTime(item.requested_at)}</span></div>
      <div className="collection-item-actions"><AppointmentDetails contactClient appointment={item} data={data} email={profiles.find((profile) => profile.id === item.client_id)?.email} />{item.status === "pending" && <><Button size="sm" disabled={!!working} onClick={() => void change(item.id, "confirmed")}>{working === item.id ? "Actualizando…" : "Confirmar"}</Button><Button size="sm" variant="outline" disabled={!!working} onClick={() => void change(item.id, "cancelled")}>Cancelar</Button></>}{item.status === "confirmed" && <><Button size="sm" disabled={!!working} onClick={() => void change(item.id, "completed")}>{working === item.id ? "Actualizando…" : "Marcar atendida"}</Button><Button size="sm" variant="outline" disabled={!!working} onClick={() => void change(item.id, "cancelled")}>Cancelar</Button></>}</div>
    </article>)}</div> : <div className="empty-state">{appointments.length ? "No hay citas que coincidan con los filtros." : "Todavía no hay solicitudes guardadas."}</div>}
    <CollectionPagination state={filters} result={page} />
  </section>
}
