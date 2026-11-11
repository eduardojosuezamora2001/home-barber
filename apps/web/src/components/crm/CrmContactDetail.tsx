import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { toUtc } from "../../lib/booking"
import { consentFor, crmApi, crmDateTime, whatsappLink, type CrmContactDetail as Detail, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmMetric } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; id: string; branchId?: string; branches?: { id: string; name: string }[] }
interface TimelineItem { key: string; at: string; title: string; detail: string }
const text = (value: unknown) => typeof value === "string" ? value : ""

const activityLabels: Record<string, string> = {
  note: "Nota", call: "Llamada", whatsapp_opened: "WhatsApp abierto",
  whatsapp_sent_confirmed: "WhatsApp enviado, confirmado por el equipo",
  whatsapp_replied: "Respuesta por WhatsApp",
}

function timelineFor(data: Detail): TimelineItem[] {
  const activities = data.activities.map((item) => ({ key: `activity-${item.id}`, at: item.occurred_at, title: activityLabels[item.kind] || item.kind, detail: item.body }))
  const inquiries = data.inquiries.map((item) => ({ key: `inquiry-${item.id}`, at: item.created_at, title: "Consulta de cita", detail: `${item.status} · ${item.message || "Sin nota"}` }))
  const appointments = data.appointments.map((item, index) => ({ key: `appointment-${text(item.id) || index}`, at: text(item.requested_at) || text(item.created_at), title: "Cita", detail: text(item.status) || "Registrada" }))
  const receipts = data.receipts.map((item, index) => ({ key: `receipt-${text(item.id) || index}`, at: text(item.issued_at), title: "Comprobante interno", detail: text(item.branch_name) || "Atención documentada" }))
  return [...activities, ...inquiries, ...appointments, ...receipts].filter((item) => !!item.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function CrmContactDetail({ role, basePath, id, branchId, branches = [] }: Props) {
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState("")
  const [message, setMessage] = useState("")
  const [isMarketing, setIsMarketing] = useState(false)
  const [whatsappOpened, setWhatsappOpened] = useState(false)

  useEffect(() => {
    let active = true
    void crmApi.contact(role, id, branchId).then((result) => { if (active) { setData(result); setError("") } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Intenta de nuevo.") })
    return () => { active = false }
  }, [role, id, branchId, refreshKey])

  const timeline = useMemo(() => data ? timelineFor(data) : [], [data])
  const contact = data?.contact
  const consent = data ? consentFor(data.consents) : undefined
  const contactBranchId = branchId || data?.branches[0]?.id || branches[0]?.id

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fullName = String(form.get("fullName") ?? "").trim()
    const email = String(form.get("email") ?? "").trim()
    const phone = String(form.get("phone") ?? "").trim()
    if (!email && !phone) { toast.error("Indica un correo o teléfono."); return }
    setWorking(true)
    try {
      await crmApi.updateContact(role, id, { fullName, email: email || null, phone: phone || null })
      setEditOpen(false); setRefreshKey((value) => value + 1); toast.success("Contacto actualizado.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo actualizar.") }
    finally { setWorking(false) }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const localDueAt = String(form.get("dueAt") ?? "")
    const [day, time] = localDueAt.split("T")
    if (!day || !time) { toast.error("Indica fecha y hora para el seguimiento."); return }
    const selectedBranchId = String(form.get("branchId") ?? "") || contactBranchId
    setWorking(true)
    try {
      await crmApi.createTask(role, { contactId: id, branchId: selectedBranchId, title: String(form.get("title") ?? "").trim(), description: String(form.get("description") ?? "").trim(), dueAt: toUtc(day, time) })
      setTaskOpen(false); setRefreshKey((value) => value + 1); toast.success("Seguimiento creado.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo crear el seguimiento.") }
    finally { setWorking(false) }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!note.trim()) return
    setWorking(true)
    try {
      await crmApi.addActivity(role, id, { kind: "note", body: note.trim(), branchId: contactBranchId })
      setNote(""); setRefreshKey((value) => value + 1); toast.success("Nota guardada.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo guardar la nota.") }
    finally { setWorking(false) }
  }

  async function saveConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const status = String(form.get("status")) as "granted" | "revoked" | "unknown"
    const evidence = String(form.get("evidence") || "").trim()
    if (status === "granted" && evidence.length < 8) { toast.error("Describe cómo aceptó recibir mensajes (mínimo 8 caracteres)."); return }
    setWorking(true)
    try {
      await crmApi.updateConsent(role, id, { status, source: "staff_record", evidence })
      setRefreshKey((value) => value + 1)
      toast.success("Permiso actualizado y registrado en el historial.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo guardar el permiso.") }
    finally { setWorking(false) }
  }

  async function openWhatsApp() {
    const url = whatsappLink(contact?.phone, message.trim())
    if (!url) { toast.error("El contacto no tiene un WhatsApp válido."); return }
    const popup = window.open("about:blank", "_blank")
    if (!popup) { toast.error("El navegador bloqueó la apertura. Permite ventanas para este sitio e inténtalo de nuevo."); return }
    popup.opener = null
    if (isMarketing) {
      try {
        const { eligibility } = await crmApi.marketingEligibility(role, id)
        if (!eligibility?.allowed) { popup.close(); toast.error(eligibility?.reason || "Falta permiso comercial."); return }
        if (eligibility.warning) toast.warning(eligibility.warning)
      } catch (cause) { popup.close(); toast.error(cause instanceof Error ? cause.message : "No se pudo comprobar el permiso comercial."); return }
    }
    popup.location.replace(url)
    setWhatsappOpened(true)
    void crmApi.addActivity(role, id, { kind: "whatsapp_opened", body: "El operador abrió WhatsApp desde el CRM.", branchId: contactBranchId, isMarketing: false })
      .then(() => setRefreshKey((value) => value + 1))
      .catch(() => toast.error("WhatsApp se abrió, pero no se pudo registrar la apertura."))
  }

  async function confirmSent() {
    setWorking(true)
    try {
      await crmApi.addActivity(role, id, { kind: "whatsapp_sent_confirmed", body: message.trim() || "Envío confirmado por el operador.", branchId: contactBranchId, isMarketing })
      setWhatsappOpened(false); setRefreshKey((value) => value + 1); toast.success("Envío registrado como confirmado por ti.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo registrar el envío.") }
    finally { setWorking(false) }
  }

  return <div className="crm-screen">
    <Link className="crm-back-link" to={`${basePath}/clientes`}>← Volver a clientes</Link>
    {error && !data ? <CrmError message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : !data || !contact ? <CrmLoading rows={6} /> : <>
      <CrmHeading title={contact.full_name} description={`${contact.phone || "Sin teléfono"} · ${contact.email || "Sin correo"}`} action={<Button type="button" variant="outline" onClick={() => setEditOpen(true)}>Editar contacto</Button>} />
      {error && <p className="crm-inline-error" role="alert">No se pudo actualizar. Mostramos el historial cargado antes.</p>}
      <div className="crm-contact-tags"><Badge variant="secondary">{contact.profile_id ? "Con cuenta" : "Sin cuenta"}</Badge>{contact.is_demo && <Badge variant="outline">DEMO</Badge>}<span>Origen: {contact.source || "—"}</span></div>
      <div className="crm-metrics crm-metrics-three">
        <CrmMetric label="Citas atendidas" value={data.summary?.completedAppointments ?? 0} />
        <CrmMetric label="Atenciones sin cita" value={data.summary?.walkInReceipts ?? 0} />
        <CrmMetric label="Comprobantes internos" value={data.summary?.documentedReceipts ?? data.receipts.length} />
      </div>
      <div className="crm-detail-grid">
        <div className="crm-detail-main">
          <Card><CardHeader><CardTitle>Historial</CardTitle><CardDescription>Consultas, citas, comprobantes y notas registradas.</CardDescription></CardHeader>
            <CardContent>{timeline.length ? <ol className="crm-timeline">{timeline.map((item) => <li key={item.key}><span>{crmDateTime(item.at)}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ol> : <p className="crm-list-empty">Aún no hay actividad registrada.</p>}{data.hasMore && <p className="crm-muted">Hay más registros históricos. Consulta el historial completo desde sus módulos de origen.</p>}</CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Agregar nota</CardTitle><CardDescription>Registra contexto útil para la próxima atención.</CardDescription></CardHeader>
            <CardContent><form onSubmit={addNote}><FieldGroup><Field><FieldLabel htmlFor="crm-contact-note">Nota interna</FieldLabel><Textarea id="crm-contact-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} required /></Field></FieldGroup><Button type="submit" variant="outline" disabled={working || !note.trim()}>Guardar nota</Button></form></CardContent>
          </Card>
        </div>
        <div className="crm-detail-side">
          <Card><CardHeader><CardTitle>Próxima acción</CardTitle><CardDescription>Crea un seguimiento con una fecha concreta.</CardDescription></CardHeader><CardContent><Button type="button" onClick={() => setTaskOpen(true)}>Programar seguimiento</Button>
            {data.tasks.filter((task) => task.status === "open").slice(0, 3).map((task) => <div className="crm-compact-task" key={task.id}><strong>{task.title}</strong><span>{crmDateTime(task.due_at)}</span></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>WhatsApp manual</CardTitle><CardDescription>El enlace solo prepara el mensaje. Confirma el envío después de enviarlo.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="crm-whatsapp-message">Mensaje</FieldLabel><Textarea id="crm-whatsapp-message" value={message} onChange={(event) => { setMessage(event.target.value); setWhatsappOpened(false) }} rows={4} maxLength={1000} placeholder="Hola, te escribimos de HOME…" /></Field><label className="crm-checkbox-line"><input type="checkbox" checked={isMarketing} onChange={(event) => { setIsMarketing(event.target.checked); setWhatsappOpened(false) }} />Es un mensaje comercial</label></FieldGroup>
            <div className="crm-action-row"><Button type="button" variant="outline" onClick={() => void openWhatsApp()} disabled={!contact.phone}>Abrir WhatsApp</Button>{whatsappOpened && <Button type="button" onClick={() => void confirmSent()} disabled={working}>Confirmar que lo envié</Button>}</div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Permiso para marketing</CardTitle><CardDescription>Se consulta antes de incluir a este contacto en campañas.</CardDescription></CardHeader><CardContent><p>{consent?.status === "granted" ? "Aceptado" : consent?.status === "revoked" ? "Retirado" : "Sin consentimiento registrado"}</p>{consent && <p className="crm-muted">Origen: {consent.source} · {crmDateTime(consent.updated_at)}</p>}<form key={consent?.updated_at || "none"} onSubmit={(event) => void saveConsent(event)}><FieldGroup><Field><FieldLabel htmlFor="crm-consent-status">Estado</FieldLabel><NativeSelect id="crm-consent-status" name="status" defaultValue={consent?.status || "unknown"}><NativeSelectOption value="unknown">Sin permiso</NativeSelectOption><NativeSelectOption value="granted">Aceptó WhatsApp comercial</NativeSelectOption><NativeSelectOption value="revoked">Retiró el permiso</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="crm-consent-evidence">Evidencia o contexto</FieldLabel><Textarea id="crm-consent-evidence" name="evidence" maxLength={500} rows={2} placeholder="Cuándo y cómo lo aceptó" defaultValue={consent?.evidence || ""} /></Field><Button type="submit" variant="outline" disabled={working}>Guardar permiso</Button></FieldGroup></form></CardContent></Card>
        </div>
      </div>
    </>}
    <Dialog open={editOpen} onOpenChange={(open) => { if (!working) setEditOpen(open) }}><DialogContent className="crm-dialog"><DialogHeader><DialogTitle>Editar contacto</DialogTitle><DialogDescription>Actualiza datos de contacto. El historial se conserva.</DialogDescription></DialogHeader>
      <form key={contact?.id} onSubmit={saveContact}><FieldGroup><Field><FieldLabel htmlFor="crm-edit-name">Nombre</FieldLabel><Input id="crm-edit-name" name="fullName" defaultValue={contact?.full_name ?? ""} required /></Field><Field><FieldLabel htmlFor="crm-edit-phone">Teléfono</FieldLabel><Input id="crm-edit-phone" name="phone" defaultValue={contact?.phone ?? ""} type="tel" /></Field><Field><FieldLabel htmlFor="crm-edit-email">Correo</FieldLabel><Input id="crm-edit-email" name="email" defaultValue={contact?.email ?? ""} type="email" /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={working}>Cancelar</Button><Button type="submit" disabled={working}>{working ? "Guardando…" : "Guardar"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
    <Dialog open={taskOpen} onOpenChange={(open) => { if (!working) setTaskOpen(open) }}><DialogContent className="crm-dialog"><DialogHeader><DialogTitle>Programar seguimiento</DialogTitle><DialogDescription>Esta tarea aparecerá en Hoy cuando llegue su fecha.</DialogDescription></DialogHeader>
      <form onSubmit={createTask}><FieldGroup><Field><FieldLabel htmlFor="crm-task-title">Motivo</FieldLabel><Input id="crm-task-title" name="title" maxLength={120} required placeholder="Confirmar próxima visita" /></Field><Field><FieldLabel htmlFor="crm-task-due">Fecha y hora</FieldLabel><Input id="crm-task-due" name="dueAt" type="datetime-local" required /></Field><Field><FieldLabel htmlFor="crm-task-description">Detalle</FieldLabel><Textarea id="crm-task-description" name="description" rows={3} maxLength={1000} /></Field>
      {role === "owner" && branches.length > 0 && <Field><FieldLabel htmlFor="crm-task-branch">Sucursal</FieldLabel><NativeSelect id="crm-task-branch" name="branchId" defaultValue={contactBranchId} className="w-full">{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>}
      </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setTaskOpen(false)} disabled={working}>Cancelar</Button><Button type="submit" disabled={working}>{working ? "Guardando…" : "Crear seguimiento"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </div>
}
