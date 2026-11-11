import { useState, type FormEvent } from "react"
import { Link, useLocation } from "react-router"
import { Plus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "sonner"
import { shortTime, WEEKDAYS } from "../lib/booking"
import { api } from "../lib/api"
import type { Barber, ManagerAssignment, Profile, PublicData } from "../lib/types"
import { TeamDirectory } from "./TeamDirectory"
import { ManagerAssignments } from "./ManagerAssignments"
import { OwnerServices } from "./OwnerServices"

interface Props {
  data: PublicData | null
  profiles: Profile[]
  managers: ManagerAssignment[]
  ownerId: string
  onRefresh: () => void | Promise<void>
  section: "sedes" | "equipo" | "servicios"
  employeeId?: string | null
  managerId?: string | null
}

function formHours(form: FormData) {
  return WEEKDAYS.map((_, weekday) => {
    const closed = form.get(`closed_${weekday}`) === "true"
    return {
      weekday,
      closed,
      opensAt: closed ? null : String(form.get(`open_${weekday}`) || "09:00"),
      closesAt: closed ? null : String(form.get(`close_${weekday}`) || "19:00"),
    }
  })
}

export function OwnerSettings({ data, profiles, managers, ownerId, onRefresh, section, employeeId, managerId }: Props) {
  const location = useLocation()
  const [branchId, setBranchId] = useState(() => new URLSearchParams(location.search).get("branch") ?? "")
  const [shiftBranchId, setShiftBranchId] = useState("")
  const branch = data?.branches.find((item) => item.id === branchId) ?? data?.branches[0]
  const employee = data?.barbers.find((item) => item.id === employeeId)
  const manager = managers.find((item) => item.user_id === managerId)
  const employeeBranchIds = data?.barberBranches.filter((item) => item.barber_id === employee?.id).map((item) => item.branch_id) ?? []
  const shiftBranch = data?.branches.find((item) => item.id === shiftBranchId && employeeBranchIds.includes(item.id))
    ?? data?.branches.find((item) => employeeBranchIds.includes(item.id))

  async function run(task: () => Promise<void>, success: string) {
    try {
      await task()
      await onRefresh()
      toast.success(success)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.")
      return false
    }
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!branch) return
    const form = new FormData(event.currentTarget)
    await run(async () => {
      await api.patch(`/owner/branches/${branch.id}`, {
        name: String(form.get("name") || "").trim(),
        locationLabel: String(form.get("location") || "").trim(),
        address: String(form.get("address") || "").trim() || null,
        whatsapp: String(form.get("whatsapp") || "").replace(/\D/g, ""),
        active: form.get("active") === "true",
      })
    }, "Sucursal actualizada.")
  }

  async function saveBranchHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!branch) return
    await run(async () => {
      await api.put(`/owner/branches/${branch.id}/hours`, { hours: formHours(new FormData(event.currentTarget)) })
    }, "Horarios de la sucursal actualizados.")
  }

  async function saveBarber(barber: Barber, branchIds: string[], event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run(async () => {
      await api.patch(`/owner/barbers/${barber.id}`, {
        displayName: String(form.get("name") || "").trim(),
        specialty: String(form.get("specialty") || "").trim(),
        bio: String(form.get("bio") || "").trim(),
        active: form.get("active") === "true",
        userId: String(form.get("user_id") || "") || null,
      })
      await api.put(`/owner/barbers/${barber.id}/branches`, { branchIds })
    }, "Perfil y sucursales del empleado actualizados.")
  }

  async function saveBarberHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!employee || !shiftBranch) return
    await run(async () => {
      await api.put(`/owner/barbers/${employee.id}/hours`, {
        branchId: shiftBranch.id,
        hours: formHours(new FormData(event.currentTarget)),
      })
    }, "Turnos del empleado actualizados.")
  }

  if (section === "sedes") return <div className="area-columns settings-columns">
    <section>
      <div className="panel-heading"><h2>Sucursales</h2><Button nativeButton={false} render={<Link to="/admin#nueva" />}><Plus data-icon="inline-start" />Nueva sucursal</Button></div>
      {!data?.branches.length ? <div className="empty-state">Aún no hay sucursales.</div> : <>
        <FieldGroup><Field><FieldLabel htmlFor="edit-branch">Elegir sucursal</FieldLabel><NativeSelect id="edit-branch" className="w-full" value={branch?.id ?? ""} onChange={(event) => setBranchId(event.target.value)}>{data.branches.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>
        {branch && <Card className="mt-5"><CardHeader><CardTitle>Datos de la sucursal</CardTitle><CardDescription>Los clientes ven estos datos al reservar.</CardDescription></CardHeader><CardContent><form key={branch.id} onSubmit={saveBranch}><FieldGroup>
          <Field><FieldLabel htmlFor="branch-name">Nombre</FieldLabel><Input id="branch-name" name="name" defaultValue={branch.name} required /></Field>
          <Field><FieldLabel htmlFor="branch-location">Ubicación breve</FieldLabel><Input id="branch-location" name="location" defaultValue={branch.location_label} required /></Field>
          <Field><FieldLabel htmlFor="branch-address">Dirección</FieldLabel><Input id="branch-address" name="address" defaultValue={branch.address ?? ""} /></Field>
          <Field><FieldLabel htmlFor="branch-whatsapp">WhatsApp</FieldLabel><Input id="branch-whatsapp" name="whatsapp" defaultValue={branch.whatsapp} required /></Field>
          <Field><FieldLabel htmlFor="branch-active">Estado</FieldLabel><NativeSelect id="branch-active" name="active" className="w-full" defaultValue={String(branch.active)}><NativeSelectOption value="true">Activa</NativeSelectOption><NativeSelectOption value="false">Oculta</NativeSelectOption></NativeSelect></Field>
          <Button type="submit">Guardar sucursal</Button>
        </FieldGroup></form></CardContent></Card>}
      </>}
    </section>
    <section><h2>Horarios de {branch?.name ?? "la sucursal"}</h2><p className="section-subtitle">Define estos horarios antes de hacer visible una sucursal nueva.</p>{branch && <ScheduleForm key={branch.id} hours={WEEKDAYS.map((_, weekday) => {
      const hour = data?.branchHours.find((item) => item.branch_id === branch.id && item.weekday === weekday)
      return { weekday, open: shortTime(hour?.opens_at ?? null), close: shortTime(hour?.closes_at ?? null), closed: hour?.closed ?? true }
    })} onSubmit={saveBranchHours} />}</section>
  </div>

  if (section === "equipo" && managerId) {
    const account = profiles.find((item) => item.id === managerId)
    if (!manager || !account || !data) return <div className="empty-state">No encontramos ese encargado. <Link to={`/admin${location.search}#equipo`}>Volver al equipo</Link></div>
    return <><nav className="admin-breadcrumb" aria-label="Ubicación"><Link to={`/admin${location.search}#equipo`}>Equipo</Link><span>/</span><span>{account.full_name || account.email || "Encargado"}</span></nav><ManagerAssignments data={data} profiles={profiles} ownerId={ownerId} /></>
  }

  if (section === "equipo" && employeeId) {
    if (!employee || !data) return <div className="empty-state">No encontramos ese empleado. <Link to={`/admin${location.search}#equipo`}>Volver al equipo</Link></div>
    const account = profiles.find((item) => item.id === employee.user_id)
    return <>
      <nav className="admin-breadcrumb" aria-label="Ubicación"><Link to={`/admin${location.search}#equipo`}>Equipo</Link><span>/</span><span>{employee.display_name}</span></nav>
      <div className="employee-hero"><div><span>Perfil del empleado</span><h2>{employee.display_name}</h2><p>{employee.specialty || "Sin especialidad"}</p></div><div><span>{employee.active ? "Visible en reservas" : "Oculto"}</span><span>{account?.email ?? "Sin cuenta vinculada"}</span></div></div>
      <div className="area-columns settings-columns">
        <section><h2>Datos y sucursales</h2><BarberEditor key={employee.id} barber={employee} data={data} profiles={profiles} managers={managers} ownerId={ownerId} onSave={saveBarber} /></section>
        <section><h2>Turnos</h2><p className="section-subtitle">Los horarios se configuran por sucursal.</p><FieldGroup><Field><FieldLabel htmlFor="shift-branch">Sucursal</FieldLabel><NativeSelect id="shift-branch" className="w-full" value={shiftBranch?.id ?? ""} onChange={(event) => setShiftBranchId(event.target.value)}>{data.branches.filter((item) => employeeBranchIds.includes(item.id)).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>
          {shiftBranch ? <ScheduleForm key={`${employee.id}-${shiftBranch.id}`} hours={WEEKDAYS.map((_, weekday) => {
            const hour = data.barberHours.find((item) => item.barber_id === employee.id && item.branch_id === shiftBranch.id && item.weekday === weekday)
            return { weekday, open: shortTime(hour?.opens_at ?? null), close: shortTime(hour?.closes_at ?? null), closed: !hour }
          })} onSubmit={saveBarberHours} /> : <div className="empty-state">Asigna una sucursal al empleado para configurar sus turnos.</div>}
        </section>
      </div>
    </>
  }

  if (section === "equipo") return <TeamDirectory data={data} profiles={profiles} onRefresh={onRefresh} />

  return <OwnerServices services={data?.services ?? []} onRefresh={onRefresh} />
}

interface ScheduleHour { weekday: number; open: string; close: string; closed: boolean }
function ScheduleForm({ hours, onSubmit }: { hours: ScheduleHour[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  return <form onSubmit={onSubmit} className="schedule-form"><div className="schedule-list">{hours.map((hour) => <div key={hour.weekday} className="schedule-row"><span>{WEEKDAYS[hour.weekday]}</span><NativeSelect name={`closed_${hour.weekday}`} defaultValue={String(hour.closed)}><NativeSelectOption value="false">Abierto</NativeSelectOption><NativeSelectOption value="true">Cerrado</NativeSelectOption></NativeSelect><Input name={`open_${hour.weekday}`} type="time" defaultValue={hour.open === "—" ? "09:00" : hour.open} aria-label={`Apertura ${WEEKDAYS[hour.weekday]}`} /><Input name={`close_${hour.weekday}`} type="time" defaultValue={hour.close === "—" ? "19:00" : hour.close} aria-label={`Cierre ${WEEKDAYS[hour.weekday]}`} /></div>)}</div><Button type="submit" variant="outline">Guardar horarios</Button></form>
}

function BarberEditor({ barber, data, profiles, managers, ownerId, onSave }: { barber: Barber; data: PublicData; profiles: Profile[]; managers: ManagerAssignment[]; ownerId: string; onSave: (barber: Barber, branchIds: string[], event: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  const [branchIds, setBranchIds] = useState(data.barberBranches.filter((item) => item.barber_id === barber.id).map((item) => item.branch_id))
  const managerIds = new Set(managers.map((item) => item.user_id))
  return <Card><CardHeader><CardTitle>{barber.display_name}</CardTitle><CardDescription>{barber.specialty || "Sin especialidad"}</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void onSave(barber, branchIds, event)}><FieldGroup>
    <Field><FieldLabel>Nombre visible</FieldLabel><Input name="name" defaultValue={barber.display_name} required /></Field>
    <Field><FieldLabel>Especialidad</FieldLabel><Input name="specialty" defaultValue={barber.specialty} /></Field>
    <Field><FieldLabel>Descripción</FieldLabel><Textarea name="bio" defaultValue={barber.bio} rows={2} /></Field>
    <Field><FieldLabel>Cuenta vinculada</FieldLabel><NativeSelect name="user_id" className="w-full" defaultValue={barber.user_id ?? ""}><NativeSelectOption value="">Sin cuenta</NativeSelectOption>{profiles.filter((item) => item.id !== ownerId && !managerIds.has(item.id)).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.email ?? item.full_name}</NativeSelectOption>)}</NativeSelect></Field>
    <FieldSet><FieldLegend>Sucursales</FieldLegend><div className="checkbox-list">{data.branches.map((branch) => <Field key={branch.id} orientation="horizontal"><Checkbox id={`${barber.id}-${branch.id}`} checked={branchIds.includes(branch.id)} onCheckedChange={(checked) => setBranchIds((current) => checked ? [...current, branch.id] : current.filter((id) => id !== branch.id))} /><FieldLabel htmlFor={`${barber.id}-${branch.id}`}>{branch.name}</FieldLabel></Field>)}</div></FieldSet>
    <Field><FieldLabel>Estado</FieldLabel><NativeSelect name="active" className="w-full" defaultValue={String(barber.active)}><NativeSelectOption value="true">Visible</NativeSelectOption><NativeSelectOption value="false">Oculto</NativeSelectOption></NativeSelect></Field>
    <Button type="submit" variant="outline">Guardar perfil</Button>
  </FieldGroup></form></CardContent></Card>
}
