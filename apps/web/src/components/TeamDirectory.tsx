import { useMemo, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { ArrowUpRight, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@workspace/ui/components/pagination"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Textarea } from "@workspace/ui/components/textarea"
import { api } from "../lib/api"
import type { Barber, Profile, PublicData } from "../lib/types"

interface Props {
  data: PublicData | null
  profiles: Profile[]
  onRefresh: () => void | Promise<void>
}

const pageSize = 8
const noBarbers: Barber[] = []
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CR")

function pageItems(total: number, current: number): (number | "ellipsis")[] {
  const pages = [...new Set([1, current - 1, current, current + 1, total].filter((page) => page >= 1 && page <= total))].sort((a, b) => a - b)
  const items: (number | "ellipsis")[] = []
  for (const page of pages) {
    if (items.length && page - Number(items[items.length - 1]) > 1) items.push("ellipsis")
    items.push(page)
  }
  return items
}

export function TeamDirectory({ data, profiles, onRefresh }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const searchParams = new URLSearchParams(location.search)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const query = searchParams.get("q") ?? ""
  const branchId = searchParams.get("branch") ?? ""
  const status = searchParams.get("status") ?? "all"
  const barbers = data?.barbers ?? noBarbers
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const branchesByBarber = useMemo(() => {
    const names = new Map<string, string[]>()
    const branchesById = new Map(data?.branches.map((branch) => [branch.id, branch.name]) ?? [])
    for (const assignment of data?.barberBranches ?? []) {
      const branchName = branchesById.get(assignment.branch_id)
      if (branchName) names.set(assignment.barber_id, [...(names.get(assignment.barber_id) ?? []), branchName])
    }
    return names
  }, [data?.barberBranches, data?.branches])

  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    return barbers.filter((barber) => {
      if (branchId && !data?.barberBranches.some((item) => item.barber_id === barber.id && item.branch_id === branchId)) return false
      if (status === "active" && !barber.active) return false
      if (status === "hidden" && barber.active) return false
      const email = profilesById.get(barber.user_id ?? "")?.email ?? ""
      return !term || normalize(`${barber.display_name} ${barber.specialty} ${email}`).includes(term)
    }).sort((a, b) => a.display_name.localeCompare(b.display_name, "es-CR"))
  }, [barbers, branchId, data?.barberBranches, profilesById, query, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const requestedPage = Number(searchParams.get("page"))
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const first = filtered.length ? (page - 1) * pageSize + 1 : 0
  const last = Math.min(page * pageSize, filtered.length)

  function updateFilter(name: "q" | "branch" | "status", value: string) {
    const next = new URLSearchParams(searchParams)
    if (value && !(name === "status" && value === "all")) next.set(name, value)
    else next.delete(name)
    next.delete("page")
    const queryString = next.toString()
    navigate(`${location.pathname}${queryString ? `?${queryString}` : ""}${location.hash}`, { replace: true })
  }

  function pageHref(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete("page")
    else next.set("page", String(nextPage))
    const queryString = next.toString()
    return `/admin${queryString ? `?${queryString}` : ""}#equipo`
  }

  function goToPage(event: React.MouseEvent<HTMLAnchorElement>, nextPage: number) {
    event.preventDefault()
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return
    const next = new URLSearchParams(searchParams)
    if (nextPage === 1) next.delete("page")
    else next.set("page", String(nextPage))
    const queryString = next.toString()
    navigate(`${location.pathname}${queryString ? `?${queryString}` : ""}${location.hash}`)
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await api.post("/owner/barbers", {
        displayName: String(form.get("name") || "").trim(),
        specialty: String(form.get("specialty") || "").trim(),
        bio: String(form.get("bio") || "").trim(),
        userId: String(form.get("user_id") || "") || null,
        branchId: String(form.get("branch_id") || ""),
      })
      await onRefresh()
      setCreateOpen(false)
      toast.success("Empleado agregado. Abre su perfil para ajustar los turnos.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo agregar el empleado.")
    } finally {
      setSaving(false)
    }
  }

  return <section className="team-directory" aria-labelledby="team-directory-title">
    <div className="team-directory-heading">
      <div><h2 id="team-directory-title">Directorio del equipo</h2><p className="team-summary">{barbers.length} {barbers.length === 1 ? "empleado" : "empleados"} · {data?.branches.length ?? 0} {data?.branches.length === 1 ? "sucursal" : "sucursales"}</p></div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger render={<Button disabled={!data?.branches.length} />}><Plus data-icon="inline-start" />Agregar empleado</DialogTrigger>
        <DialogContent className="team-create-dialog" data-ui>
          <DialogHeader><DialogTitle>Agregar empleado</DialogTitle><DialogDescription>Asigna una sucursal inicial. Podrás ajustar las demás y sus turnos desde el perfil.</DialogDescription></DialogHeader>
          <form onSubmit={createEmployee} className="team-create-form"><FieldGroup>
            <Field><FieldLabel htmlFor="new-barber-name">Nombre visible</FieldLabel><Input id="new-barber-name" name="name" maxLength={100} required /></Field>
            <Field><FieldLabel htmlFor="new-barber-specialty">Especialidad</FieldLabel><Input id="new-barber-specialty" name="specialty" maxLength={120} /></Field>
            <Field><FieldLabel htmlFor="new-barber-bio">Descripción</FieldLabel><Textarea id="new-barber-bio" name="bio" rows={2} maxLength={600} /></Field>
            <Field><FieldLabel htmlFor="new-barber-branch">Sucursal inicial</FieldLabel><NativeSelect id="new-barber-branch" name="branch_id" className="w-full" required>{data?.branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="new-barber-user">Cuenta para iniciar sesión</FieldLabel><NativeSelect id="new-barber-user" name="user_id" className="w-full"><NativeSelectOption value="">Asignar después</NativeSelectOption>{profiles.filter((profile) => profile.email !== "pachadcacique@gmail.com").map((profile) => <NativeSelectOption key={profile.id} value={profile.id}>{profile.email ?? profile.full_name}</NativeSelectOption>)}</NativeSelect></Field>
          </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar empleado"}</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>
    </div>

    <div className="team-filters" aria-label="Filtros del equipo">
      <Field className="team-search-field"><FieldLabel htmlFor="team-search">Buscar empleado</FieldLabel><div className="team-search-control"><Search aria-hidden="true" /><Input id="team-search" type="search" placeholder="Nombre, especialidad o correo" value={query} onChange={(event) => updateFilter("q", event.target.value)} /></div></Field>
      <Field><FieldLabel htmlFor="team-branch">Sucursal</FieldLabel><NativeSelect id="team-branch" value={branchId} onChange={(event) => updateFilter("branch", event.target.value)}><NativeSelectOption value="">Todas las sucursales</NativeSelectOption>{data?.branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="team-status">Estado</FieldLabel><NativeSelect id="team-status" value={status} onChange={(event) => updateFilter("status", event.target.value)}><NativeSelectOption value="all">Todos</NativeSelectOption><NativeSelectOption value="active">Activos</NativeSelectOption><NativeSelectOption value="hidden">Ocultos</NativeSelectOption></NativeSelect></Field>
    </div>

    <div className="team-results"><span>{filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}</span><span>{first}–{last} de {filtered.length}</span></div>
    <div className="team-table-head" aria-hidden="true"><span>Empleado</span><span>Sucursales</span><span>Estado</span><span>Cuenta</span><span></span></div>
    <ScrollArea key={`${query}-${branchId}-${status}-${page}`} className="team-scroll-area" style={{ height: Math.min(Math.max(visible.length * 84, 94), 490) }}>
      <div className="team-list">
        {visible.map((barber) => {
          const branchNames = branchesByBarber.get(barber.id) ?? []
          const account = profilesById.get(barber.user_id ?? "")
          return <Link key={barber.id} to={`/admin${searchParams.size ? `?${searchParams}` : ""}#equipo/${encodeURIComponent(barber.id)}`} className="team-row">
            <span className="team-person"><Avatar size="lg" className="team-avatar-ui"><AvatarFallback>{barber.display_name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><span className="team-info"><strong>{barber.display_name}</strong><small>{barber.specialty || "Barbero"}</small></span></span>
            <span className="team-branches">{branchNames.join(", ") || "Sin sucursal"}</span>
            <span className="team-state"><Badge variant="secondary">{barber.active ? "Activo" : "Oculto"}</Badge></span>
            <span className="team-account">{account?.email ?? "Sin cuenta"}</span>
            <ArrowUpRight className="team-open" aria-hidden="true" />
          </Link>
        })}
        {!visible.length && <div className="team-empty">{barbers.length ? "No hay empleados que coincidan con estos filtros." : "Aún no hay empleados. Agrega el primero para configurar sus sucursales y turnos."}</div>}
      </div>
    </ScrollArea>
    <div className="team-pagination"><span>Página {page} de {totalPages}</span><Pagination aria-label="Páginas del equipo"><PaginationContent>
      <PaginationItem><PaginationPrevious href={pageHref(page - 1)} text="Anterior" aria-label="Página anterior" aria-disabled={page === 1} tabIndex={page === 1 ? -1 : 0} onClick={(event) => goToPage(event, page - 1)} /></PaginationItem>
      {pageItems(totalPages, page).map((item, index) => <PaginationItem key={`${item}-${index}`}>{item === "ellipsis" ? <PaginationEllipsis /> : <PaginationLink href={pageHref(item)} isActive={item === page} aria-label={`Página ${item}`} onClick={(event) => goToPage(event, item)}>{item}</PaginationLink>}</PaginationItem>)}
      <PaginationItem><PaginationNext href={pageHref(page + 1)} text="Siguiente" aria-label="Página siguiente" aria-disabled={page === totalPages} tabIndex={page === totalPages ? -1 : 0} onClick={(event) => goToPage(event, page + 1)} /></PaginationItem>
    </PaginationContent></Pagination></div>
    {!data?.branches.length && <p className="team-branch-note">Agrega una sucursal antes de crear empleados. <Link to="/admin#nueva">Crear sucursal</Link></p>}
  </section>
}
