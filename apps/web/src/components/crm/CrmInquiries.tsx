import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { crmApi, crmDateTime, type CrmInquiry, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmPager, CrmState } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; branchId?: string }
const labels: Record<string, string> = { new: "Nueva", contacted: "Contactada", booked: "Reservó", lost: "No concretó" }

export function CrmInquiries({ role, basePath, branchId }: Props) {
  const [items, setItems] = useState<CrmInquiry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    void crmApi.inquiries(role, { page, pageSize: 12, status, branchId }).then((result) => {
      if (!active) return
      setItems(result.inquiries); setTotal(result.total); setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las consultas.") })
    return () => { active = false }
  }, [role, page, status, branchId, refresh])

  async function change(item: CrmInquiry, next: string) {
    setBusy(item.id)
    try { await crmApi.updateInquiry(role, item.id, next); setRefresh((value) => value + 1); toast.success("Consulta actualizada.") }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo actualizar.") }
    finally { setBusy("") }
  }

  return <div className="crm-screen">
    <CrmHeading title="Consultas" description="Solicitudes web y del equipo. Contacta a la persona y registra qué ocurrió." />
    <div className="crm-filter-row"><Field><FieldLabel htmlFor="crm-inquiry-status">Estado</FieldLabel><NativeSelect id="crm-inquiry-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><NativeSelectOption value="">Todas</NativeSelectOption>{Object.entries(labels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field></div>
    {error && !items ? <CrmError message={error} onRetry={() => setRefresh((value) => value + 1)} /> : !items ? <CrmLoading /> : <>
      {error && <p role="alert" className="crm-inline-error">{error}</p>}
      {items.length ? <Card><CardContent><ul className="crm-task-list">{items.map((item) => <li key={item.id}>
        <div className="crm-task-main"><Link to={`${basePath}/clientes/${item.contact_id}`}>{item.contact?.full_name || "Cliente"}</Link>{item.contact?.is_demo && <Badge variant="outline">DEMO</Badge>}<strong>{item.message || "Consulta de cita"}</strong><span>{crmDateTime(item.created_at)}{item.preferred_at ? ` · Desea ${crmDateTime(item.preferred_at)}` : ""}</span></div>
        <div className="crm-task-meta"><Badge variant="secondary">{labels[item.status] || item.status}</Badge></div>
        <div className="crm-task-actions"><Button nativeButton={false} render={<Link to={`${basePath}/clientes/${item.contact_id}`} />} size="sm" variant="outline">Abrir ficha</Button>{item.status === "new" && <Button type="button" size="sm" disabled={!!busy} onClick={() => void change(item, "contacted")}>Marcar contactada</Button>}{item.status !== "booked" && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void change(item, "booked")}>Reservó</Button>}{item.status !== "lost" && <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => void change(item, "lost")}>No concretó</Button>}</div>
      </li>)}</ul></CardContent></Card> : <CrmState title="No hay consultas en esta vista" description="Las solicitudes web aparecerán aquí cuando alguien pida una cita." />}
      <CrmPager page={page} pageSize={12} total={total} onPage={setPage} />
    </>}
  </div>
}
