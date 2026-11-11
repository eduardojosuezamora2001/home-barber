import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { crmApi, type CrmContact, type CrmListQuery, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmPager, CrmState } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; branchId?: string; branches?: { id: string; name: string }[] }
const money = new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 })

export function CrmContacts({ role, basePath, branchId, branches = [] }: Props) {
  const navigate = useNavigate()
  const [items, setItems] = useState<CrmContact[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<CrmListQuery>({})
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingCampaign, setSavingCampaign] = useState(false)
  const [discountType, setDiscountType] = useState("none")
  const pageSize = 12

  useEffect(() => {
    let active = true
    void crmApi.contacts(role, { ...filters, page, pageSize, q: query, branchId, includeDemo: true }).then((result) => {
      if (!active) return
      setItems(result.contacts); setTotal(result.total); setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Intenta de nuevo.") })
    return () => { active = false }
  }, [role, page, query, filters, branchId, refreshKey])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const numberValue = (name: string) => String(form.get(name) ?? "").trim() ? Number(form.get(name)) : undefined
    const textValue = (name: string) => String(form.get(name) ?? "").trim() || undefined
    setQuery(textValue("q") ?? "")
    setFilters({
      minSpent: numberValue("minSpent"), maxSpent: numberValue("maxSpent"),
      spentFrom: textValue("spentFrom"), spentTo: textValue("spentTo"),
      minAttendances: numberValue("minAttendances"), maxAttendances: numberValue("maxAttendances"),
      attendanceFrom: textValue("attendanceFrom"), attendanceTo: textValue("attendanceTo"),
    })
    setPage(1); setSelected([])
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected.length) return
    const form = new FormData(event.currentTarget)
    setSavingCampaign(true)
    try {
      const type = String(form.get("discountType") || "none") as "none" | "fixed" | "percentage"
      const amount = type === "none" ? 0 : Number(form.get("discountValue"))
      const { campaign } = await crmApi.createCampaign(role, {
        name: String(form.get("name") || "").trim(), goal: String(form.get("goal") || "").trim(),
        messageTemplate: String(form.get("message") || "").trim(), branchId,
        discountType: type, discountValue: amount, couponValidDays: Number(form.get("couponValidDays") || 30),
      })
      const warnings: string[] = []
      let added = 0
      for (let index = 0; index < selected.length; index += 100) {
        const result = await crmApi.addRecipients(role, campaign.id, selected.slice(index, index + 100))
        added += result.recipients.length
        warnings.push(...result.warnings.map((item) => item.warning))
      }
      setCampaignOpen(false); setSelected([]); setRefreshKey((value) => value + 1)
      if (added) toast.success(`Campaña creada con ${added} clientes${type === "none" ? "." : " y sus cupones de descuento."}`)
      else toast.warning("La campaña se creó, pero ningún cliente seleccionado cumple los requisitos para recibirla.")
      if (warnings.length) toast.warning(`${warnings.length} clientes se omitieron por consentimiento, cuenta o sucursal.`)
      navigate(`${basePath}/campanas`)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo crear la campaña.") }
    finally { setSavingCampaign(false) }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fullName = String(form.get("fullName") ?? "").trim()
    const email = String(form.get("email") ?? "").trim()
    const phone = String(form.get("phone") ?? "").trim()
    if (!email && !phone) { toast.error("Indica un correo o teléfono para identificar al contacto."); return }
    setSaving(true)
    try {
      const created = await crmApi.createContact(role, {
        fullName, email: email || null, phone: phone || null, source: "manual",
        branchId: String(form.get("branchId") ?? "") || branchId,
      })
      setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1)
      toast.success(`Contacto ${created.contact.full_name} creado.`)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo crear el contacto.") }
    finally { setSaving(false) }
  }

  const selectPage = (checked: boolean) => setSelected((current) => checked
    ? [...new Set([...current, ...(items ?? []).map((item) => item.id)])]
    : current.filter((id) => !(items ?? []).some((item) => item.id === id)))

  return <div className="crm-screen">
    <CrmHeading title="Clientes" description="Filtra por gasto en comprobantes pagados y visitas atendidas. Las fechas se pueden dejar vacías para usar todo el historial." action={<div className="crm-action-row"><Button type="button" disabled={!selected.length || (role === "owner" && !branchId)} onClick={() => { setDiscountType("none"); setCampaignOpen(true) }}>Crear campaña{selected.length ? ` · ${selected.length}` : ""}</Button><Button type="button" variant="outline" disabled={role === "owner" && branches.length === 0} onClick={() => setCreateOpen(true)}>Agregar contacto</Button></div>} />
    {role === "owner" && !branchId && <p className="crm-muted">Selecciona una sede en la barra superior para preparar una campaña con estos clientes.</p>}
    <Card><CardHeader><CardTitle>Filtros de clientes</CardTitle><CardDescription>Las fechas son opcionales. Al dejarlas vacías, se cuenta todo el historial disponible.</CardDescription></CardHeader><CardContent>
      <form role="search" onSubmit={applyFilters}><FieldGroup className="crm-contact-filters">
        <Field><FieldLabel htmlFor="crm-contact-search">Nombre, teléfono o correo</FieldLabel><Input id="crm-contact-search" name="q" type="search" defaultValue={query} placeholder="Buscar contacto" /></Field>
        <div className="crm-filter-group"><strong>Dinero gastado (₡)</strong><div className="crm-filter-pair"><Field><FieldLabel htmlFor="crm-min-spent">Monto mínimo</FieldLabel><Input id="crm-min-spent" name="minSpent" type="number" min="0" step="0.01" placeholder="0" defaultValue={filters.minSpent} /></Field><Field><FieldLabel htmlFor="crm-max-spent">Monto máximo</FieldLabel><Input id="crm-max-spent" name="maxSpent" type="number" min="0" step="0.01" placeholder="Sin límite" defaultValue={filters.maxSpent} /></Field></div><div className="crm-filter-pair"><Field><FieldLabel htmlFor="crm-spent-from">Desde</FieldLabel><Input id="crm-spent-from" name="spentFrom" type="date" defaultValue={filters.spentFrom} /></Field><Field><FieldLabel htmlFor="crm-spent-to">Hasta</FieldLabel><Input id="crm-spent-to" name="spentTo" type="date" defaultValue={filters.spentTo} /></Field></div></div>
        <div className="crm-filter-group"><strong>Cantidad de asistencias</strong><div className="crm-filter-pair"><Field><FieldLabel htmlFor="crm-min-attendance">Mínimo</FieldLabel><Input id="crm-min-attendance" name="minAttendances" type="number" min="0" step="1" placeholder="0" defaultValue={filters.minAttendances} /></Field><Field><FieldLabel htmlFor="crm-max-attendance">Máximo</FieldLabel><Input id="crm-max-attendance" name="maxAttendances" type="number" min="0" step="1" placeholder="Sin límite" defaultValue={filters.maxAttendances} /></Field></div><div className="crm-filter-pair"><Field><FieldLabel htmlFor="crm-attendance-from">Desde</FieldLabel><Input id="crm-attendance-from" name="attendanceFrom" type="date" defaultValue={filters.attendanceFrom} /></Field><Field><FieldLabel htmlFor="crm-attendance-to">Hasta</FieldLabel><Input id="crm-attendance-to" name="attendanceTo" type="date" defaultValue={filters.attendanceTo} /></Field></div></div>
        <div className="crm-action-row"><Button type="submit" variant="outline">Aplicar filtros</Button><Button type="reset" variant="ghost" onClick={() => { setQuery(""); setFilters({}); setPage(1); setSelected([]) }}>Limpiar filtros</Button></div>
      </FieldGroup></form>
    </CardContent></Card>
    {error && !items ? <CrmError message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : !items ? <CrmLoading rows={7} /> : <>
      {error && <p className="crm-inline-error" role="alert">No se pudo actualizar el directorio. Mostramos los últimos resultados.</p>}
      {selected.length > 0 && <div className="crm-selection-bar"><span>{selected.length} clientes seleccionados</span><Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Quitar selección</Button></div>}
      {items.length ? <Card className="crm-table-card"><CardContent>
        <Table className="crm-contacts-table"><TableHeader><TableRow><TableHead><input aria-label="Seleccionar clientes de esta página" type="checkbox" checked={items.length > 0 && items.every((item) => selected.includes(item.id))} onChange={(event) => selectPage(event.target.checked)} /></TableHead><TableHead>Cliente</TableHead><TableHead>Gastado</TableHead><TableHead>Asistencias</TableHead><TableHead>Teléfono</TableHead><TableHead>Correo</TableHead><TableHead>Cuenta</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((contact) => <TableRow key={contact.id}>
            <TableCell><input aria-label={`Seleccionar a ${contact.full_name}`} type="checkbox" checked={selected.includes(contact.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} /></TableCell>
            <TableCell className="crm-contact-identity"><Link to={`${basePath}/clientes/${contact.id}`}>{contact.full_name}</Link>{contact.is_demo && <Badge variant="outline">DEMO</Badge>}</TableCell>
            <TableCell>{money.format(contact.spent || 0)}</TableCell><TableCell>{contact.attendances || 0}</TableCell>
            <TableCell>{contact.phone || "—"}</TableCell><TableCell>{contact.email || "—"}</TableCell><TableCell>{contact.profile_id ? "Sí" : "No"}</TableCell>
          </TableRow>)}</TableBody></Table>
      </CardContent></Card> : <CrmState title={query || Object.values(filters).some(Boolean) ? "Sin coincidencias" : "Aún no hay contactos"} description={query || Object.values(filters).some(Boolean) ? "Prueba con otro monto, cantidad o período." : "Agrega un contacto o importa una lista para empezar."} />}
      <CrmPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </>}
    <Dialog open={createOpen} onOpenChange={(open) => { if (!saving) setCreateOpen(open) }}><DialogContent className="crm-dialog">
      <DialogHeader><DialogTitle>Agregar contacto</DialogTitle><DialogDescription>Este registro no crea una cuenta de cliente.</DialogDescription></DialogHeader>
      <form onSubmit={createContact}><FieldGroup>
        <Field><FieldLabel htmlFor="crm-new-name">Nombre</FieldLabel><Input id="crm-new-name" name="fullName" minLength={2} maxLength={120} required /></Field>
        <Field><FieldLabel htmlFor="crm-new-phone">Teléfono o WhatsApp</FieldLabel><Input id="crm-new-phone" name="phone" type="tel" autoComplete="tel" /></Field>
        <Field><FieldLabel htmlFor="crm-new-email">Correo</FieldLabel><Input id="crm-new-email" name="email" type="email" autoComplete="email" /></Field>
        {role === "owner" && branches.length > 0 && <Field><FieldLabel htmlFor="crm-new-branch">Sucursal</FieldLabel><NativeSelect id="crm-new-branch" name="branchId" defaultValue={branchId || branches[0].id} className="w-full">{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>}
      </FieldGroup><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar contacto"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
    <Dialog open={campaignOpen} onOpenChange={(open) => { if (!savingCampaign) setCampaignOpen(open) }}><DialogContent className="crm-dialog"><DialogHeader><DialogTitle>Campaña para {selected.length} clientes</DialogTitle><DialogDescription>Solo se incluirán contactos con permiso vigente para recibir marketing. Los cupones se emiten a clientes con cuenta.</DialogDescription></DialogHeader>
      <form onSubmit={createCampaign}><FieldGroup>
        <Field><FieldLabel htmlFor="crm-selected-campaign-name">Nombre de la campaña</FieldLabel><Input id="crm-selected-campaign-name" name="name" minLength={3} maxLength={120} required placeholder="Clientes frecuentes de noviembre" /></Field>
        <Field><FieldLabel htmlFor="crm-selected-campaign-goal">Objetivo</FieldLabel><Input id="crm-selected-campaign-goal" name="goal" minLength={3} maxLength={300} required placeholder="Aumentar las reservas de regreso" /></Field>
        <Field><FieldLabel htmlFor="crm-selected-discount-type">Beneficio</FieldLabel><NativeSelect id="crm-selected-discount-type" name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value)}><NativeSelectOption value="none">Sin cupón</NativeSelectOption><NativeSelectOption value="percentage">Descuento porcentual</NativeSelectOption><NativeSelectOption value="fixed">Descuento en colones</NativeSelectOption></NativeSelect></Field>
        {discountType !== "none" && <><Field><FieldLabel htmlFor="crm-selected-discount-value">{discountType === "percentage" ? "Porcentaje de descuento" : "Monto en colones"}</FieldLabel><Input id="crm-selected-discount-value" name="discountValue" type="number" min="0.01" max={discountType === "percentage" ? 100 : 120000000} step="0.01" required /></Field><Field><FieldLabel htmlFor="crm-selected-coupon-days">Vigencia del cupón (días)</FieldLabel><Input id="crm-selected-coupon-days" name="couponValidDays" type="number" min="1" max="365" defaultValue={30} required /></Field></>}
        <Field><FieldLabel htmlFor="crm-selected-campaign-message">Mensaje para WhatsApp</FieldLabel><Textarea id="crm-selected-campaign-message" name="message" minLength={10} maxLength={1500} rows={4} required defaultValue="Hola {nombre}, gracias por elegir HOME. Usa tu cupón {cupon} en tu próxima visita." /><span className="crm-muted">El personal revisa y envía cada mensaje. Variables disponibles: {"{nombre}"}{discountType !== "none" ? " y {cupon}" : ""}.</span></Field>
      </FieldGroup><DialogFooter><Button type="button" variant="outline" disabled={savingCampaign} onClick={() => setCampaignOpen(false)}>Cancelar</Button><Button type="submit" disabled={savingCampaign}>{savingCampaign ? "Preparando…" : "Crear campaña y audiencia"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </div>
}
