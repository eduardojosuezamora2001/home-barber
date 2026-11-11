import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { crmApi, whatsappLink, type CrmCampaign, type CrmCampaignRecipient, type CrmContact, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmPager, CrmState } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; branchId?: string; branches?: { id: string; name: string }[] }
const recipientLabels: Record<string, string> = { pending: "Pendiente", contacted: "Contactado", responded: "Respondió", booked: "Reservó", converted: "Volvió", skipped: "Omitido" }

export function CrmCampaigns({ role, basePath, branchId, branches = [] }: Props) {
  const [campaigns, setCampaigns] = useState<CrmCampaign[] | null>(null)
  const [activeId, setActiveId] = useState("")
  const [recipients, setRecipients] = useState<CrmCampaignRecipient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [candidates, setCandidates] = useState<CrmContact[]>([])
  const [candidateTotal, setCandidateTotal] = useState(0)
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidateInput, setCandidateInput] = useState("")
  const [candidateSearch, setCandidateSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [opened, setOpened] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const campaign = campaigns?.find((item) => item.id === activeId)

  useEffect(() => {
    let mounted = true
    void crmApi.campaigns(role, branchId).then(({ campaigns: rows }) => {
      if (!mounted) return
      setCampaigns(rows); setActiveId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || ""); setError("")
    }).catch((cause) => { if (mounted) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las campañas.") })
    return () => { mounted = false }
  }, [role, branchId, refresh])

  useEffect(() => {
    if (!campaign) return
    let mounted = true
    void Promise.all([
      crmApi.recipients(role, campaign.id, page),
      campaign.status === "draft" ? crmApi.contacts(role, { page: candidatePage, pageSize: 25, q: candidateSearch, branchId: campaign.branch_id, marketingEligible: true }) : Promise.resolve({ contacts: [] as CrmContact[], total: 0 }),
    ]).then(([audience, contacts]) => {
      if (!mounted) return
      setRecipients(audience.recipients); setTotal(audience.total); setCandidates(contacts.contacts); setCandidateTotal(contacts.total); setError("")
    }).catch((cause) => { if (mounted) setError(cause instanceof Error ? cause.message : "No se pudo cargar la audiencia.") })
    return () => { mounted = false }
  }, [role, campaign, page, candidatePage, candidateSearch, refresh])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { campaign: created } = await crmApi.createCampaign(role, {
        name: String(form.get("name") || "").trim(), goal: String(form.get("goal") || "").trim(),
        messageTemplate: String(form.get("message") || "").trim(), branchId: String(form.get("branch") || "") || branchId || undefined,
      })
      setActiveId(created.id); setRecipients([]); setCandidates([]); setTotal(0); setCandidateTotal(0); setCandidatePage(1); setCandidateSearch(""); setCandidateInput(""); setPage(1); setRefresh((value) => value + 1); event.currentTarget.reset(); toast.success("Campaña creada en borrador.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo crear la campaña.") }
    finally { setBusy(false) }
  }

  async function status(next: "active" | "completed") {
    if (!campaign) return
    setBusy(true)
    try { await crmApi.updateCampaign(role, campaign.id, { status: next }); setRefresh((value) => value + 1); toast.success(next === "active" ? "Campaña activada." : "Campaña finalizada.") }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo actualizar la campaña.") }
    finally { setBusy(false) }
  }

  async function addAudience() {
    if (!campaign || selected.length === 0) return
    setBusy(true)
    try {
      const result = await crmApi.addRecipients(role, campaign.id, selected)
      setSelected([]); setRefresh((value) => value + 1)
      toast.success(`${result.recipients.length} destinatarios añadidos.${result.warnings.length ? ` ${result.warnings.length} con límite de frecuencia cercano.` : ""}`)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo preparar la audiencia.") }
    finally { setBusy(false) }
  }

  async function openMessage(item: CrmCampaignRecipient) {
    if (!campaign) return
    const message = campaign.message_template.replaceAll("{nombre}", item.contact?.full_name || "")
      .replaceAll("{cupon}", item.coupon_code || "")
    const link = whatsappLink(item.contact?.phone, message)
    if (!link) { toast.error("El contacto no tiene un WhatsApp válido."); return }
    const popup = window.open("about:blank", "_blank")
    if (!popup) { toast.error("El navegador bloqueó WhatsApp. Permite ventanas emergentes e inténtalo de nuevo."); return }
    popup.opener = null
    try {
      const { eligibility } = await crmApi.marketingEligibility(role, item.contact_id)
      if (!eligibility?.allowed) { popup.close(); toast.error(eligibility?.reason || "Este contacto ya no puede recibir campañas."); return }
      if (eligibility.warning) toast.warning(eligibility.warning)
      popup.location.replace(link)
      setOpened(item.id)
    } catch (cause) { popup.close(); toast.error(cause instanceof Error ? cause.message : "No se pudo comprobar el permiso comercial.") }
  }

  async function updateRecipient(item: CrmCampaignRecipient, next: string) {
    if (!campaign) return
    setBusy(true)
    try {
      await crmApi.updateRecipient(role, campaign.id, item.id, { status: next })
      if (opened === item.id) setOpened("")
      setRefresh((value) => value + 1)
      toast.success(next === "contacted" ? "Envío confirmado por ti." : "Resultado registrado.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo registrar el resultado.") }
    finally { setBusy(false) }
  }

  return <div className="crm-screen">
    <CrmHeading title="Campañas" description="Prepara la audiencia, revisa cada mensaje y confirma manualmente el envío desde WhatsApp." />
    {error && !campaigns ? <CrmError message={error} onRetry={() => setRefresh((value) => value + 1)} /> : !campaigns ? <CrmLoading /> : <>
      <Card><CardHeader><CardTitle>Nueva campaña</CardTitle><CardDescription>Empieza con un objetivo concreto. Los contactos DEMO y quienes no aceptaron marketing quedan fuera de la audiencia.</CardDescription></CardHeader><CardContent><form onSubmit={create}><FieldGroup>
        {role === "owner" && <Field><FieldLabel htmlFor="crm-campaign-branch">Sucursal</FieldLabel><NativeSelect id="crm-campaign-branch" name="branch" required defaultValue={branchId || ""}><NativeSelectOption value="">Seleccionar sucursal</NativeSelectOption>{branches.map((branch) => <NativeSelectOption value={branch.id} key={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>}
        <Field><FieldLabel htmlFor="crm-campaign-name">Nombre</FieldLabel><Input id="crm-campaign-name" name="name" minLength={3} maxLength={120} required placeholder="Recuperar clientes inactivos" /></Field>
        <Field><FieldLabel htmlFor="crm-campaign-goal">Meta medible</FieldLabel><Input id="crm-campaign-goal" name="goal" minLength={3} maxLength={300} required placeholder="Lograr 10 reservas en 30 días" /></Field>
        <Field><FieldLabel htmlFor="crm-campaign-message">Mensaje para revisar</FieldLabel><Textarea id="crm-campaign-message" name="message" minLength={10} maxLength={1500} rows={3} required defaultValue="Hola {nombre}, te escribimos de HOME. ¿Te gustaría reservar tu próxima visita?" /><span className="crm-muted">Usa {'{nombre}'} para personalizar. Cada envío requiere revisión humana.</span></Field>
        <Button type="submit" disabled={busy || (role === "owner" && branches.length === 0)}>Crear borrador</Button>
      </FieldGroup></form></CardContent></Card>
      {campaigns.length ? <><Card><CardHeader><CardTitle>Campañas existentes</CardTitle></CardHeader><CardContent><Field><FieldLabel htmlFor="crm-campaign-select">Campaña</FieldLabel><NativeSelect id="crm-campaign-select" value={activeId} onChange={(event) => { setActiveId(event.target.value); setRecipients([]); setCandidates([]); setTotal(0); setCandidateTotal(0); setCandidatePage(1); setCandidateSearch(""); setCandidateInput(""); setPage(1); setSelected([]); setOpened("") }}>{campaigns.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.status === "draft" ? "Borrador" : item.status === "active" ? "Activa" : "Finalizada"}</NativeSelectOption>)}</NativeSelect></Field></CardContent></Card>
        {campaign && <Card><CardHeader><CardTitle>{campaign.name}</CardTitle><CardDescription>{campaign.goal}</CardDescription></CardHeader><CardContent><div className="crm-action-row"><Badge variant="secondary">{campaign.status === "draft" ? "Borrador" : campaign.status === "active" ? "Activa" : "Finalizada"}</Badge>{campaign.status === "draft" && <Button type="button" disabled={busy || total === 0} onClick={() => void status("active")}>Activar campaña</Button>}{campaign.status === "active" && <Button type="button" variant="outline" disabled={busy} onClick={() => void status("completed")}>Finalizar</Button>}</div>{campaign.promotion_id && <p className="crm-muted">Cupón personal: {campaign.discount_type === "percentage" ? `${campaign.discount_value}%` : `₡${Number(campaign.discount_value).toLocaleString("es-CR")}`} de descuento · vence en {campaign.coupon_valid_days} días.</p>}<p className="crm-muted">{campaign.message_template}</p></CardContent></Card>}
        {campaign?.status === "draft" && <Card><CardHeader><CardTitle>Elegir audiencia</CardTitle><CardDescription>Contactos con consentimiento para WhatsApp en esta sucursal. La elegibilidad se comprueba de nuevo al guardar y al confirmar cada envío.</CardDescription></CardHeader><CardContent>
          <form className="crm-search-row" role="search" onSubmit={(event) => { event.preventDefault(); setCandidatePage(1); setCandidateSearch(candidateInput.trim()) }}><Field><FieldLabel htmlFor="crm-audience-search">Buscar contacto elegible</FieldLabel><Input id="crm-audience-search" type="search" value={candidateInput} onChange={(event) => setCandidateInput(event.target.value)} placeholder="Nombre, teléfono o correo" /></Field><Button type="submit" variant="outline">Buscar</Button></form>
          {candidates.length ? <div className="crm-audience-list">{candidates.map((contact) => <label key={contact.id}><input type="checkbox" checked={selected.includes(contact.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} /><span>{contact.full_name} · {contact.phone}</span></label>)}</div> : <p className="crm-muted">No hay contactos elegibles en esta búsqueda.</p>}
          <CrmPager page={candidatePage} pageSize={25} total={candidateTotal} onPage={setCandidatePage} />
          <Button type="button" disabled={busy || selected.length === 0} onClick={() => void addAudience()}>Añadir {selected.length} a la audiencia</Button>
        </CardContent></Card>}
        {campaign && <Card><CardHeader><CardTitle>Destinatarios</CardTitle><CardDescription>{total} personas · Abre WhatsApp, envía el mensaje y después confirma aquí.</CardDescription></CardHeader><CardContent>{recipients.length ? <ul className="crm-task-list">{recipients.map((item) => <li key={item.id}><div className="crm-task-main"><Link to={`${basePath}/clientes/${item.contact_id}`}>{item.contact?.full_name || "Cliente"}</Link><span>{item.contact?.phone || "Sin teléfono"}{item.coupon_code ? ` · Cupón ${item.coupon_code}` : ""}</span></div><Badge variant="secondary">{recipientLabels[item.status] || item.status}</Badge><div className="crm-task-actions">{campaign.status === "active" && item.status === "pending" && <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void openMessage(item)}>Abrir WhatsApp</Button>{opened === item.id && <Button type="button" size="sm" disabled={busy} onClick={() => void updateRecipient(item, "contacted")}>Confirmar envío</Button>}<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void updateRecipient(item, "skipped")}>Omitir</Button></>}{campaign.status === "active" && item.status === "contacted" && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void updateRecipient(item, "responded")}>Respondió</Button>}{campaign.status === "active" && ["contacted", "responded"].includes(item.status) && <Button type="button" size="sm" disabled={busy} onClick={() => void updateRecipient(item, "booked")}>Reservó</Button>}{campaign.status === "active" && item.status === "booked" && <Button type="button" size="sm" disabled={busy} onClick={() => void updateRecipient(item, "converted")}>Volvió</Button>}</div></li>)}</ul> : <CrmState title="Sin destinatarios" description="Añade contactos elegibles para empezar." />}<CrmPager page={page} pageSize={25} total={total} onPage={setPage} /></CardContent></Card>}
      </> : <CrmState title="Aún no hay campañas" description="Crea un borrador para organizar el próximo seguimiento comercial." />}
    </>}
  </div>
}
