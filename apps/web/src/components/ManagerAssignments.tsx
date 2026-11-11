import { useCallback, useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { api } from "../lib/api"
import type { ManagerAssignment, Profile, PublicData } from "../lib/types"

interface Props { data: PublicData | null; profiles: Profile[]; ownerId: string }

export function ManagerAssignments({ data, profiles, ownerId }: Props) {
  const [managers, setManagers] = useState<ManagerAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    try { setManagers((await api.get<{ managers: ManagerAssignment[] }>("/owner/managers")).managers) }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudieron cargar los encargados.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  const assignedIds = new Set(managers.map((item) => item.user_id))
  const barberIds = new Set(data?.barbers.map((item) => item.user_id).filter(Boolean))
  const candidates = profiles.filter((item) => item.id !== ownerId && !assignedIds.has(item.id) && !barberIds.has(item.id))

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    setBusy(true)
    try {
      await api.post("/owner/managers", { userId: String(form.get("userId")), branchId: String(form.get("branchId")) })
      await refresh()
      element.reset()
      toast.success("Encargado asignado a la sucursal.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo asignar el encargado.") }
    finally { setBusy(false) }
  }

  async function reassign(userId: string, branchId: string) {
    setBusy(true)
    try { await api.post("/owner/managers", { userId, branchId }); await refresh(); toast.success("Sucursal del encargado actualizada.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cambiar la sucursal.") }
    finally { setBusy(false) }
  }

  async function revoke(userId: string) {
    setBusy(true)
    try { await api.delete(`/owner/managers/${userId}`); await refresh(); toast.success("Acceso de encargado revocado.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo revocar el acceso.") }
    finally { setBusy(false) }
  }

  return <div className="area-columns manager-admin-layout"><section><h2>Encargados por sucursal</h2><p className="section-subtitle">Cada cuenta encargada tiene acceso operativo a una sola sucursal. Solo el propietario puede cambiar esa asignación.</p>
    {loading ? <div className="empty-state">Cargando encargados…</div> : managers.length ? <div className="area-list">{managers.map((manager) => {
      const person = profiles.find((item) => item.id === manager.user_id)
      return <ManagerRow key={manager.user_id} name={person?.full_name || person?.email || "Cuenta sin nombre"} email={person?.email ?? ""} branchId={manager.branch_id} branches={data?.branches ?? []} busy={busy} onReassign={(branchId) => void reassign(manager.user_id, branchId)} onRevoke={() => void revoke(manager.user_id)} />
    })}</div> : <div className="empty-state">Aún no hay encargados asignados.</div>}
  </section><section><h2>Asignar encargado</h2><Card><CardHeader><CardTitle>Cuenta y sucursal</CardTitle><CardDescription>La persona debe tener una cuenta registrada y el correo confirmado para poder entrar.</CardDescription></CardHeader><CardContent><form onSubmit={assign}><FieldGroup>
    <Field><FieldLabel htmlFor="manager-user">Cuenta</FieldLabel><NativeSelect id="manager-user" name="userId" required><NativeSelectOption value="">Seleccionar cuenta</NativeSelectOption>{candidates.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.full_name || item.email} · {item.email}</NativeSelectOption>)}</NativeSelect></Field>
    <Field><FieldLabel htmlFor="manager-branch">Sucursal asignada</FieldLabel><NativeSelect id="manager-branch" name="branchId" required><NativeSelectOption value="">Seleccionar sucursal</NativeSelectOption>{data?.branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
    <Button type="submit" disabled={busy || !candidates.length || !data?.branches.length}>Asignar encargado</Button>
  </FieldGroup></form></CardContent></Card>{!candidates.length && <p className="muted-line">No hay cuentas libres para asignar. La persona puede registrarse desde el sitio y confirmar su correo.</p>}</section></div>
}

function ManagerRow({ name, email, branchId, branches, busy, onReassign, onRevoke }: {
  name: string; email: string; branchId: string; branches: PublicData["branches"]; busy: boolean
  onReassign: (branchId: string) => void; onRevoke: () => void
}) {
  const [selected, setSelected] = useState(branchId)
  return <Card><CardHeader><div className="manager-assignment-head"><div><CardTitle>{name}</CardTitle><CardDescription>{email}</CardDescription></div><Badge variant="secondary">Encargado</Badge></div></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor={`manager-branch-${branchId}-${email}`}>Sucursal</FieldLabel><NativeSelect id={`manager-branch-${branchId}-${email}`} value={selected} onChange={(event) => setSelected(event.target.value)}>{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field><div className="row-actions"><Button size="sm" disabled={busy || selected === branchId} onClick={() => onReassign(selected)}>Guardar cambio</Button><Button size="sm" variant="outline" disabled={busy} onClick={onRevoke}>Revocar acceso</Button></div></FieldGroup></CardContent></Card>
}
