import { useEffect, useId, useState } from "react"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group"
import { crmApi, type CrmContact, type CrmRole } from "../../lib/crm"
import type { CrmContactPickerValue } from "./CrmContactPicker"

interface Props {
  role: CrmRole
  value: CrmContactPickerValue | null
  onChange: (contact: CrmContactPickerValue | null) => void
  disabled?: boolean
}

export function CrmContactAutocomplete({ role, value, onChange, disabled }: Props) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (!open || value || query.trim().length < 2) return
    let active = true
    const timer = window.setTimeout(() => {
      void crmApi.contacts(role, { q: query.trim(), pageSize: 12, includeDemo: true }).then((page) => {
        if (active) { setResults(page.contacts); setLoading(false) }
      }).catch((cause) => {
        if (active) { setError(cause instanceof Error ? cause.message : "No se pudo buscar."); setLoading(false) }
      })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, query, role, value])

  function select(contact: CrmContactPickerValue) {
    onChange(contact)
    setOpen(false)
    setResults([])
    setActiveIndex(-1)
  }

  return <Field><FieldLabel htmlFor={id}>Cliente: nombre, correo o teléfono</FieldLabel>
    <div className="crm-autocomplete" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
      <InputGroup><InputGroupInput id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && !value} aria-controls={`${id}-results`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" value={value ? value.email || value.full_name : query} readOnly={!!value} disabled={disabled} placeholder="Escribe al menos 2 caracteres para buscar en el CRM" onFocus={() => { if (!value) setOpen(true) }} onChange={(event) => { setQuery(event.target.value); setResults([]); setError(""); setActiveIndex(-1); setLoading(event.target.value.trim().length >= 2); setOpen(true) }} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setActiveIndex(-1) }
        if (!open || !results.length) return
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, results.length - 1)) }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
        if (event.key === "Enter") { event.preventDefault(); if (activeIndex >= 0) select(results[activeIndex]) }
      }} />{value && <InputGroupAddon align="inline-end"><InputGroupButton disabled={disabled} onClick={() => { onChange(null); setQuery(""); setResults([]); setError(""); setOpen(false); document.getElementById(id)?.focus() }}>Cambiar cliente</InputGroupButton></InputGroupAddon>}</InputGroup>
      {open && !value && <div className="crm-autocomplete-menu">
        <ul id={`${id}-results`} role="listbox" aria-label="Clientes del CRM" className="crm-picker-results">{results.map((contact, index) => <li id={`${id}-option-${index}`} key={contact.id} role="option" aria-selected={activeIndex === index}><button type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => select(contact)}><strong>{contact.full_name}</strong><span>{[contact.email, contact.phone].filter(Boolean).join(" · ")} · {contact.profile_id ? "Con cuenta" : "Cliente de mostrador"}</span></button></li>)}</ul>
        {error ? <p role="alert" className="crm-inline-error">{error}</p> : query.trim().length < 2 ? <p className="crm-muted">Busca por nombre, correo o teléfono.</p> : loading ? <p role="status" className="crm-muted">Buscando clientes…</p> : !results.length && <p role="status" className="crm-muted">No hay coincidencias.</p>}
      </div>}
    </div>
  </Field>
}
