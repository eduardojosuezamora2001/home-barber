import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { crmApi, crmDateTime, type CrmRole, type CrmTask } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmPager, CrmState } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; branchId?: string }
const statusLabels: Record<CrmTask["status"], string> = { open: "Pendiente", done: "Completada", cancelled: "Descartada" }

export function CrmTasks({ role, basePath, branchId }: Props) {
  const [now] = useState(() => Date.now())
  const [items, setItems] = useState<CrmTask[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<CrmTask["status"] | "">("open")
  const [error, setError] = useState("")
  const [working, setWorking] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 12

  useEffect(() => {
    let active = true
    void crmApi.tasks(role, { page, pageSize, status, branchId }).then((result) => {
      if (!active) return
      setItems(result.tasks)
      setTotal(result.total)
      setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Intenta de nuevo.") })
    return () => { active = false }
  }, [role, page, status, branchId, refreshKey])

  async function change(task: CrmTask, next: CrmTask["status"]) {
    setWorking(task.id)
    try {
      await crmApi.updateTask(role, task.id, { status: next })
      setRefreshKey((value) => value + 1)
      toast.success(next === "done" ? "Seguimiento completado." : "Seguimiento descartado.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo actualizar el seguimiento.") }
    finally { setWorking("") }
  }

  return <div className="crm-screen">
    <CrmHeading title="Seguimientos" description="Cada tarea tiene una persona responsable y un momento para actuar." />
    <div className="crm-filter-row"><Field><FieldLabel htmlFor="crm-task-status">Estado</FieldLabel><NativeSelect id="crm-task-status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }}><NativeSelectOption value="">Todos</NativeSelectOption>{Object.entries(statusLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field></div>
    {error && !items ? <CrmError message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : !items ? <CrmLoading rows={6} /> : <>
      {error && <p className="crm-inline-error" role="alert">No se pudo actualizar. Mostramos los últimos seguimientos.</p>}
      {items.length ? <Card><CardHeader><CardTitle>{status ? statusLabels[status] : "Todos los seguimientos"}</CardTitle><CardDescription>{total} en esta vista</CardDescription></CardHeader>
        <CardContent><ul className="crm-task-list">{items.map((task) => <li key={task.id}>
          <div className="crm-task-main"><Link to={`${basePath}/clientes/${task.contact_id}`}>{task.contact?.full_name || "Cliente"}{task.contact?.is_demo && <Badge variant="outline">DEMO</Badge>}</Link><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</div>
          <div className="crm-task-meta"><span>{crmDateTime(task.due_at)}</span><Badge variant={task.status === "open" && Date.parse(task.due_at) < now ? "destructive" : "secondary"}>{task.status === "open" && Date.parse(task.due_at) < now ? "Vencida" : statusLabels[task.status]}</Badge></div>
          <div className="crm-task-actions"><Button nativeButton={false} render={<Link to={`${basePath}/clientes/${task.contact_id}`} />} variant="outline" size="sm">Abrir ficha</Button>{task.status === "open" && <><Button type="button" size="sm" disabled={!!working} onClick={() => void change(task, "done")}>Completar</Button><Button type="button" variant="ghost" size="sm" disabled={!!working} onClick={() => void change(task, "cancelled")}>Descartar</Button></>}</div>
        </li>)}</ul></CardContent>
      </Card> : <CrmState title="No hay seguimientos en esta vista" description="Abre la ficha de un cliente para programar una nueva tarea." />}
      <CrmPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </>}
  </div>
}
