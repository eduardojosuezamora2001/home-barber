import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { crmApi, type CrmContact, type CrmRole } from "../../lib/crm"

export type CrmContactPickerValue = Pick<CrmContact, "id" | "profile_id" | "full_name" | "email" | "phone">

interface Props {
  role: CrmRole
  branchId?: string
  value: CrmContactPickerValue | null
  onChange: (contact: CrmContactPickerValue | null) => void
  label?: string
  disabled?: boolean
}

export function CrmContactPicker({ role, branchId, value, onChange, label = "Cliente", disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || query.trim().length < 2) return
    let active = true
    const timer = window.setTimeout(() => {
      void crmApi.contacts(role, { q: query.trim(), branchId, page: 1, pageSize: 12, includeDemo: true })
        .then((page) => { if (active) { setResults(page.contacts); setError(""); setLoading(false) } })
        .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "No se pudo buscar."); setLoading(false) } })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, query, role, branchId])

  return <>
    <Field><FieldLabel>{label}</FieldLabel><div className="crm-picker-current"><span>{value ? `${value.full_name}${value.email ? ` · ${value.email}` : value.phone ? ` · ${value.phone}` : ""}` : "Sin cliente seleccionado"}</span><Button type="button" variant="outline" onClick={() => { setQuery(""); setResults([]); setOpen(true) }} disabled={disabled}>{value ? "Cambiar" : "Buscar cliente"}</Button>{value && <Button type="button" variant="ghost" onClick={() => onChange(null)} disabled={disabled}>Quitar</Button>}</div></Field>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="crm-dialog crm-picker-dialog"><DialogHeader><DialogTitle>Buscar cliente</DialogTitle><DialogDescription>Encuentra una cuenta o contacto de mostrador por nombre, teléfono o correo.</DialogDescription></DialogHeader>
      <FieldGroup><Field><FieldLabel htmlFor="crm-picker-search">Nombre, teléfono o correo</FieldLabel><Input id="crm-picker-search" type="search" value={query} autoFocus onChange={(event) => { setQuery(event.target.value); setLoading(event.target.value.trim().length >= 2); setResults([]); setError("") }} placeholder="Escribe al menos 2 caracteres" /></Field></FieldGroup>
      {error && <p className="crm-inline-error" role="alert">{error}</p>}
      {query.trim().length < 2 ? <p className="crm-muted">Escribe para buscar en el directorio.</p> : loading ? <p className="crm-muted" role="status">Buscando…</p> : results.length ? <ul className="crm-picker-results">{results.map((contact) => <li key={contact.id}><button type="button" onClick={() => { onChange({ id: contact.id, profile_id: contact.profile_id, full_name: contact.full_name, email: contact.email, phone: contact.phone }); setOpen(false) }}><strong>{contact.full_name}</strong><span>{contact.phone || contact.email || "Sin dato de contacto"}{contact.is_demo ? " · DEMO" : ""}</span></button></li>)}</ul> : <p className="crm-muted">No hay coincidencias.</p>}
    </DialogContent></Dialog>
  </>
}
