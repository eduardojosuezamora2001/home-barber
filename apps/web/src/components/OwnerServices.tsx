import { useState, type FormEvent } from "react"
import { Plus, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { api } from "../lib/api"
import { matchesSearch, useCollectionState } from "../lib/collections"
import type { Service } from "../lib/types"
import { CollectionControls, CollectionPagination } from "./CollectionControls"

const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(value)

export function OwnerServices({ services, onRefresh }: { services: Service[]; onRefresh: () => void | Promise<void> }) {
  const filters = useCollectionState("servicios", "grid")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const filtered = services.filter((service) => matchesSearch(filters.get("q"), service.name, service.description) &&
    (!filters.get("status") || service.active === (filters.get("status") === "active"))
  ).sort((a, b) => filters.get("sort") === "price-asc" ? (a.price ?? Infinity) - (b.price ?? Infinity) : filters.get("sort") === "price-desc" ? (b.price ?? -Infinity) - (a.price ?? -Infinity) : filters.get("sort") === "duration" ? a.duration_minutes - b.duration_minutes : a.name.localeCompare(b.name, "es-CR"))
  const page = filters.paginate(filtered)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    const payload = {
      name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim(),
      durationMinutes: Number(form.get("duration")), price: form.get("price") === "" ? null : Number(form.get("price")),
      points: Number(form.get("points")), active: form.get("active") === "true",
    }
    try {
      if (editing) await api.patch(`/owner/services/${editing.id}`, payload)
      else await api.post("/owner/services", payload)
      await onRefresh()
      setOpen(false)
      toast.success(editing ? "Servicio actualizado." : "Servicio agregado.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el servicio. Intenta de nuevo.") }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}>
    <section>
      <div className="panel-heading"><div><h2>Servicios</h2><p className="section-subtitle">Administra precios, duración y disponibilidad.</p></div><DialogTrigger render={<Button />} onClick={() => { setEditing(null); setError("") }}><Plus data-icon="inline-start" />Agregar servicio</DialogTrigger></div>
      <CollectionControls state={filters} searchLabel="Buscar servicio" sorts={[{ value: "name", label: "Nombre A–Z" }, { value: "price-asc", label: "Menor precio" }, { value: "price-desc", label: "Mayor precio" }, { value: "duration", label: "Menor duración" }]}>
        <Field><FieldLabel htmlFor="servicios-status">Estado</FieldLabel><NativeSelect id="servicios-status" value={filters.get("status")} onChange={(event) => filters.update("status", event.target.value)}><NativeSelectOption value="">Todos los servicios</NativeSelectOption><NativeSelectOption value="active">Visibles al reservar</NativeSelectOption><NativeSelectOption value="hidden">Ocultos</NativeSelectOption></NativeSelect></Field>
      </CollectionControls>
      {page.items.length ? <div className="collection-results" data-layout={filters.layout}>{page.items.map((service) => <article key={service.id} className="collection-item">
        <div className="collection-item-main"><h3>{service.name}</h3><p>{service.description || "Sin descripción."}</p></div>
        <div className="collection-item-meta"><Badge variant="secondary">{service.active ? "Visible" : "Oculto"}</Badge><strong>{service.price === null ? "Precio por confirmar" : money(service.price)}</strong><span>{service.duration_minutes} min · {service.points} puntos</span></div>
        <div className="collection-item-actions"><DialogTrigger render={<Button variant="outline" size="sm" />} onClick={() => { setEditing(service); setError("") }}><Pencil data-icon="inline-start" />Editar servicio</DialogTrigger></div>
      </article>)}</div> : <div className="empty-state">{services.length ? "No hay servicios que coincidan con los filtros." : "Agrega tu primer servicio para que los clientes puedan reservar."}</div>}
      <CollectionPagination state={filters} result={page} />
    </section>
    <DialogContent className="team-create-dialog service-editor-dialog" showCloseButton={!saving}>
      <DialogHeader><DialogTitle>{editing ? "Editar servicio" : "Agregar servicio"}</DialogTitle><DialogDescription>{editing ? `Actualiza los datos de ${editing.name}.` : "Define el servicio que podrán elegir tus clientes."}</DialogDescription></DialogHeader>
      <form key={editing?.id ?? "new"} onSubmit={save}><FieldGroup>
        <Field><FieldLabel htmlFor="service-editor-name">Nombre</FieldLabel><Input id="service-editor-name" name="name" defaultValue={editing?.name ?? ""} minLength={2} maxLength={100} required disabled={saving} /></Field>
        <Field><FieldLabel htmlFor="service-editor-description">Descripción</FieldLabel><Textarea id="service-editor-description" name="description" defaultValue={editing?.description ?? ""} maxLength={500} rows={3} disabled={saving} /></Field>
        <div className="form-grid form-grid-three">
          <Field><FieldLabel htmlFor="service-editor-duration">Duración (min)</FieldLabel><Input id="service-editor-duration" name="duration" type="number" min={15} max={240} defaultValue={editing?.duration_minutes ?? 45} required disabled={saving} /></Field>
          <Field><FieldLabel htmlFor="service-editor-price">Precio (₡)</FieldLabel><Input id="service-editor-price" name="price" type="number" min={0} max={1000000} step="0.01" defaultValue={editing?.price ?? ""} placeholder="Por confirmar" disabled={saving} /></Field>
          <Field><FieldLabel htmlFor="service-editor-points">Puntos</FieldLabel><Input id="service-editor-points" name="points" type="number" min={0} max={100000} defaultValue={editing?.points ?? 100} required disabled={saving} /></Field>
        </div>
        <Field><FieldLabel htmlFor="service-editor-status">Estado</FieldLabel><NativeSelect id="service-editor-status" name="active" defaultValue={String(editing?.active ?? true)} disabled={saving}><NativeSelectOption value="true">Visible al reservar</NativeSelectOption><NativeSelectOption value="false">Oculto</NativeSelectOption></NativeSelect></Field>
        {error && <p role="alert" className="form-message">{error}</p>}
      </FieldGroup><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar servicio"}</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>
}
