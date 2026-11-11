import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { api } from "../lib/api"

interface Props {
  onCreated: (id: string) => void | Promise<void>
  onMessage: (message: string) => void
}

export function NewBranchPage({ onCreated, onMessage }: Props) {
  const [saving, setSaving] = useState(false)

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const whatsapp = String(form.get("whatsapp") || "").replace(/\D/g, "")
    if (whatsapp.length < 8) {
      onMessage("Ingresa el WhatsApp de la sucursal con código de país.")
      return
    }
    setSaving(true)
    try {
      const result = await api.post<{ id: string }>("/owner/branches", {
        name: String(form.get("name") || "").trim(),
        locationLabel: String(form.get("location") || "").trim(),
        address: String(form.get("address") || "").trim() || null,
        whatsapp,
        active: false,
      })
      await onCreated(result.id)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo crear la sucursal.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="new-branch-layout">
    <section>
      <nav className="admin-breadcrumb" aria-label="Ubicación"><Link to="/admin#sedes">Sucursales</Link><span>/</span><span>Nueva sucursal</span></nav>
      <Card><CardHeader><CardTitle>Añadir sucursal</CardTitle><CardDescription>Completa la información que se mostrará a los clientes al reservar.</CardDescription></CardHeader><CardContent><form onSubmit={createBranch}><FieldGroup>
        <Field><FieldLabel htmlFor="new-branch-name">Nombre</FieldLabel><Input id="new-branch-name" name="name" placeholder="HOME Escazú" maxLength={100} required /></Field>
        <Field><FieldLabel htmlFor="new-branch-location">Ubicación breve</FieldLabel><Input id="new-branch-location" name="location" placeholder="Escazú, San José" maxLength={120} required /></Field>
        <Field><FieldLabel htmlFor="new-branch-address">Dirección</FieldLabel><Input id="new-branch-address" name="address" placeholder="Dirección para llegar" maxLength={250} /></Field>
        <Field><FieldLabel htmlFor="new-branch-whatsapp">WhatsApp Business</FieldLabel><Input id="new-branch-whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue="50660524368" required /></Field>
        <div className="row-actions"><Button type="submit" disabled={saving}>{saving ? "Creando…" : "Crear sucursal"}</Button><Link className="admin-text-link" to="/admin#sedes">Cancelar</Link></div>
      </FieldGroup></form></CardContent></Card>
    </section>
    <aside className="branch-create-note"><span>01 / Activación</span><h2>Primero los horarios. Después, publicar.</h2><p>La sucursal se crea oculta. Al terminar, configura sus horarios y cambia el estado a “Activa” para que aparezca en las reservas.</p></aside>
  </div>
}
