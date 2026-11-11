import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { crmApi, crmDateTime, type CrmInquiry, type CrmOpportunities, type CrmRole, type CrmSummary, type CrmTask } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmMetric, CrmState } from "./CrmCommon"

interface Props { role: CrmRole; basePath: string; branchId?: string }

export function CrmToday({ role, basePath, branchId }: Props) {
  const [now] = useState(() => Date.now())
  const [data, setData] = useState<{ summary: CrmSummary; tasks: CrmTask[]; inquiries: CrmInquiry[]; opportunities: CrmOpportunities } | null>(null)
  const [error, setError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([
      crmApi.summary(role, branchId),
      crmApi.tasks(role, { page: 1, pageSize: 5, status: "open", branchId }),
      crmApi.inquiries(role, { page: 1, pageSize: 5, status: "new", branchId }),
      crmApi.opportunities(role, branchId),
    ]).then(([summary, tasks, inquiries, opportunities]) => {
      if (!active) return
      setData({ summary, tasks: tasks.tasks, inquiries: inquiries.inquiries, opportunities })
      setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Intenta de nuevo.") })
    return () => { active = false }
  }, [role, branchId, refreshKey])

  return <div className="crm-screen">
    <CrmHeading title="Hoy" description="Consultas y seguimientos que necesitan una decisión." action={<Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>Actualizar</Button>} />
    {error && !data ? <CrmError message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : !data ? <CrmLoading rows={5} /> : <>
      {error && <p className="crm-inline-error" role="alert">No se pudo actualizar. Mostramos los datos cargados antes.</p>}
      <div className="crm-metrics" aria-label="Resumen del CRM">
        <CrmMetric label="Consultas abiertas" value={data.summary.inquiriesOpen} />
        <CrmMetric label="Seguimientos exigibles" value={data.summary.tasksDue} />
        <CrmMetric label="Tareas vencidas" value={data.summary.tasksOverdue} />
        <CrmMetric label="Contactos sin DEMO" value={data.summary.contactsTotal} />
      </div>
      <div className="crm-today-grid">
        <Card><CardHeader><CardTitle>Ofrecer próxima cita</CardTitle><CardDescription>Clientes atendidos en las últimas 24 horas sin reserva futura.</CardDescription></CardHeader><CardContent>{data.opportunities.rebooking.length ? <ul className="crm-plain-list">{data.opportunities.rebooking.map((item) => <li key={item.contact_id}><div><Link to={`${basePath}/clientes/${item.contact_id}`}>{item.name}</Link><span>Próxima visita sugerida: {crmDateTime(item.due_at)}{item.is_demo_interval ? " · intervalo DEMO" : ""}</span></div></li>)}</ul> : <p className="crm-list-empty">No hay clientes recientes por reagendar.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recuperar inactivos</CardTitle><CardDescription>Última atención documentada anterior al intervalo sugerido, sin reserva futura.</CardDescription></CardHeader><CardContent>{data.opportunities.inactive.length ? <ul className="crm-plain-list">{data.opportunities.inactive.map((item) => <li key={item.contact_id}><div><Link to={`${basePath}/clientes/${item.contact_id}`}>{item.name}</Link><span>Regreso sugerido desde {crmDateTime(item.due_at)}{item.is_demo_interval ? " · DEMO" : ""}</span></div></li>)}</ul> : <p className="crm-list-empty">No hay clientes inactivos en la muestra reciente.</p>}</CardContent></Card>
      </div>
        <Card><CardHeader><CardTitle>Huecos por cancelación</CardTitle><CardDescription>Cancelaciones futuras de los próximos siete días. Comprueba la agenda antes de ofrecer una hora.</CardDescription></CardHeader><CardContent>{data.opportunities.cancellations.length ? <ul className="crm-plain-list">{data.opportunities.cancellations.map((item) => <li key={item.id}><div><strong>{crmDateTime(item.requested_at)}</strong><span>Revisa disponibilidad del profesional en la agenda</span></div><Button nativeButton={false} render={<Link to={`${basePath}/campanas`} />} size="sm" variant="outline">Preparar contacto</Button></li>)}</ul> : <p className="crm-list-empty">No hay cancelaciones futuras registradas.</p>}</CardContent></Card>
      {data.opportunities.sampleLimited && <p className="crm-muted">Las sugerencias de regreso usan los últimos 500 comprobantes de hasta 180 días; puede haber más clientes fuera de esta muestra.</p>}
      <div className="crm-today-grid">
        <Card>
          <CardHeader><CardTitle>Seguimientos pendientes</CardTitle><CardDescription>Prioriza las tareas vencidas y las de hoy.</CardDescription></CardHeader>
          <CardContent>{data.tasks.length ? <ul className="crm-plain-list">{data.tasks.map((task) => <li key={task.id}>
            <div><Link to={`${basePath}/clientes/${task.contact_id}`}>{task.contact?.full_name || "Cliente"}</Link><span>{task.title}</span></div>
            <div><span>{crmDateTime(task.due_at)}</span>{Date.parse(task.due_at) < now && <Badge variant="destructive">Vencida</Badge>}</div>
          </li>)}</ul> : <p className="crm-list-empty">No hay seguimientos pendientes.</p>}</CardContent>
          <div className="crm-card-link"><Button nativeButton={false} render={<Link to={`${basePath}/seguimientos`} />} variant="outline" size="sm">Ver seguimientos</Button></div>
        </Card>
        <Card>
          <CardHeader><CardTitle>Consultas por responder</CardTitle><CardDescription>Solicitudes registradas que todavía no se han resuelto.</CardDescription></CardHeader>
          <CardContent>{data.inquiries.length ? <ul className="crm-plain-list">{data.inquiries.map((inquiry) => <li key={inquiry.id}>
            <div><Link to={`${basePath}/clientes/${inquiry.contact_id}`}>{inquiry.contact?.full_name || "Cliente"}</Link><span>{inquiry.message || "Consulta de cita"}</span></div>
            <span>{crmDateTime(inquiry.created_at)}</span>
          </li>)}</ul> : <p className="crm-list-empty">No hay consultas abiertas.</p>}</CardContent>
          <div className="crm-card-link"><Button nativeButton={false} render={<Link to={`${basePath}/consultas`} />} variant="outline" size="sm">Ver consultas</Button></div>
        </Card>
      </div>
      {data.summary.campaignsActive === 0 && <CrmState title="No hay campañas activas" description="Crea una campaña manual para contactar a clientes con consentimiento y medir su respuesta." action={<Button nativeButton={false} render={<Link to={`${basePath}/campanas`} />}>Ir a campañas</Button>} />}
    </>}
  </div>
}
